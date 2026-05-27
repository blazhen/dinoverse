import * as Phaser from 'phaser';

const WORLD_W = 2600;
const WORLD_H = 720;
const GROUND_TOP = 540;

const VIEW_W = 1280;
const VIEW_H = 720;

const PLAYER_W = 34;
const NORMAL_H = 46;
const CRAWL_H = 26;

const RUN_SPEED = 210;
const CRAWL_SPEED = 95;
const GRAVITY_Y = 1100;

// Mario-tight jump tuning.
const COYOTE_MS = 110; // grace period to still jump after leaving a ledge
const JUMP_BUFFER_MS = 120; // press jump slightly early and it still fires on landing
const JUMP_CUT = 0.45; // release jump early → cut upward velocity (short hop)

type Body = Phaser.Physics.Arcade.Body;

interface Hero {
  id: 'trik' | 'stego' | 'brachio';
  name: string;
  emoji: string;
  color: number;
  jump: number;
  box: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Text;
  start: { x: number; y: number };
  door: { x: number; y: number };
  facing: number;
  home: boolean;
}

class ExpeditionScene extends Phaser.Scene {
  private heroes: Hero[] = [];
  private active = 0;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private breakables!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private crawling = false;
  private dashEndAt = 0;
  private dashReadyAt = 0;
  private smashReadyAt = 0;
  private lastGroundedAt = 0;
  private jumpBufferedAt = -9999;
  private wasGrounded = true;
  private won = false;
  private followMode = false; // when ON, idle dinos follow the active one (Greak-style regroup)
  // On-screen touch input (merged with keyboard each frame).
  private touch = {
    left: false,
    right: false,
    down: false,
    jumpDown: false,
    jumpPressed: false,
    abilityPressed: false,
  };

  constructor() {
    super('expedition');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#bae6fd');
    this.cameras.main.setRoundPixels(true);

    this.buildParallax();

    this.solids = this.physics.add.staticGroup();
    this.breakables = this.physics.add.staticGroup();

    // Continuous ground (no pits — heroes can always walk to each gate). Extends to the
    // bottom of the taller viewport so there's no sky showing beneath the ground.
    this.addSolid(WORLD_W / 2, GROUND_TOP + (WORLD_H - GROUND_TOP) / 2, WORLD_W, WORLD_H - GROUND_TOP, 0x3f6212, 0x365314);

    // ── Stego gate: a sealed nook; only Stego can smash the front block ──
    this.addSolid(700, 470, 40, 100, 0x57534e, 0x44403c); // back wall
    this.addSolid(650, 430, 140, 20, 0x57534e, 0x44403c); // ceiling
    this.addBreakable(610, 500, 40, 70); // smashable front block

    // ── Trik gate: launch + door platforms with a gap to dash across ──
    this.addSolid(1180, 430, 150, 20, 0x65a30d, 0x4d7c0f);
    this.addSolid(1480, 430, 150, 20, 0x65a30d, 0x4d7c0f);

    // ── Brachio gate: a high platform only the high jump can reach ──
    this.addSolid(2100, 300, 170, 20, 0x65a30d, 0x4d7c0f);

    // Doors (colored, with the matching dino).
    const doorDefs: Omit<Hero, 'box' | 'sprite' | 'facing' | 'home'>[] = [
      {
        id: 'stego',
        name: 'Stego',
        emoji: '🐢',
        color: 0x38bdf8,
        jump: -560,
        start: { x: 160, y: 460 },
        door: { x: 650, y: 500 },
      },
      {
        id: 'trik',
        name: 'Trik',
        emoji: '🦖',
        color: 0xfacc15,
        jump: -560,
        start: { x: 110, y: 460 },
        door: { x: 1480, y: 400 },
      },
      {
        id: 'brachio',
        name: 'Brachiosaurus',
        emoji: '🦕',
        color: 0xfb923c,
        jump: -800, // high jump
        start: { x: 210, y: 460 },
        door: { x: 2100, y: 270 },
      },
    ];

    for (const d of doorDefs) {
      this.add.rectangle(d.door.x, d.door.y, 46, 76, d.color, 0.45).setStrokeStyle(3, d.color);
      this.add.text(d.door.x, d.door.y - 54, d.emoji, { fontSize: '20px' }).setOrigin(0.5).setAlpha(0.7);
    }

    // Heroes.
    for (const d of doorDefs) {
      const box = this.add.rectangle(d.start.x, d.start.y, PLAYER_W, NORMAL_H, 0x000000, 0);
      this.physics.add.existing(box);
      (box.body as Body).setCollideWorldBounds(false);
      this.physics.add.collider(box, this.solids);
      this.physics.add.collider(box, this.breakables);
      const sprite = this.add
        .text(d.start.x, d.start.y, d.emoji, { fontSize: '42px' })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(5);
      this.heroes.push({ ...d, box, sprite, facing: 1, home: false });
    }

    this.cameras.main.startFollow(this.heroes[this.active]!.box, true, 0.12, 0.12);

    this.hud = this.add
      .text(12, 8, '', { fontSize: '14px', color: '#0f172a', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(10);

    this.banner = this.add
      .text(VIEW_W / 2, VIEW_H * 0.38, '', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#065f46',
        padding: { x: 16, y: 10 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11)
      .setAlpha(0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,Q,F') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    // Only show on-screen controls on touch devices (coarse pointer); desktop uses the keyboard.
    const isTouch =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) {
      this.input.addPointer(3); // several simultaneous touches (move + jump + …)
      this.createTouchControls();
    }

    this.updateHud();
  }

  private addSolid(x: number, y: number, w: number, h: number, fill: number, stroke: number) {
    const r = this.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke);
    this.solids.add(r);
  }

  private addBreakable(x: number, y: number, w: number, h: number) {
    const r = this.add.rectangle(x, y, w, h, 0xa16207).setStrokeStyle(3, 0x713f12);
    // crack hint
    this.add.text(x, y, '✶', { fontSize: '16px', color: '#fde68a' }).setOrigin(0.5);
    this.breakables.add(r);
  }

  private buildParallax() {
    for (let i = 0; i < 9; i++) {
      this.add.ellipse(200 + i * 320, 90 + (i % 3) * 30, 140, 50, 0xffffff, 0.7).setScrollFactor(0.2).setDepth(-3);
    }
    for (let i = 0; i < 8; i++) {
      this.add.ellipse(150 + i * 380, 560, 520, 360, 0x86efac, 0.6).setScrollFactor(0.35).setDepth(-2);
    }
    for (let i = 0; i < 9; i++) {
      this.add.ellipse(i * 330, 600, 420, 320, 0x4ade80, 0.6).setScrollFactor(0.6).setDepth(-1);
    }
  }

  /** A round, semi-transparent on-screen button pinned to the camera. Works with touch + mouse. */
  private touchButton(
    x: number,
    y: number,
    r: number,
    label: string,
    handlers: { onDown?: () => void; onUp?: () => void; onPress?: () => void },
  ) {
    const c = this.add
      .circle(x, y, r, 0xffffff, 0.22)
      .setScrollFactor(0)
      .setDepth(20)
      .setStrokeStyle(3, 0xffffff, 0.55)
      .setInteractive();
    this.add
      .text(x, y, label, { fontSize: `${Math.round(r)}px` })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21);
    const press = () => {
      c.setFillStyle(0xffffff, 0.42);
      handlers.onDown?.();
      handlers.onPress?.();
    };
    const release = () => {
      c.setFillStyle(0xffffff, 0.22);
      handlers.onUp?.();
    };
    c.on('pointerdown', press);
    c.on('pointerup', release);
    c.on('pointerout', release);
    c.on('pointerupoutside', release);
  }

  private createTouchControls() {
    const bottom = VIEW_H - 96;

    // Movement — left thumb.
    this.touchButton(108, bottom, 48, '◀', {
      onDown: () => (this.touch.left = true),
      onUp: () => (this.touch.left = false),
    });
    this.touchButton(234, bottom, 48, '▶', {
      onDown: () => (this.touch.right = true),
      onUp: () => (this.touch.right = false),
    });

    // Actions — right thumb. Jump is the big primary; crouch + ability grouped with it.
    this.touchButton(VIEW_W - 112, bottom, 56, '▲', {
      onDown: () => {
        this.touch.jumpDown = true;
        this.touch.jumpPressed = true;
      },
      onUp: () => (this.touch.jumpDown = false),
    });
    this.touchButton(VIEW_W - 246, bottom, 44, '▼', {
      onDown: () => (this.touch.down = true),
      onUp: () => (this.touch.down = false),
    });
    this.touchButton(VIEW_W - 150, bottom - 142, 46, '★', {
      onPress: () => (this.touch.abilityPressed = true),
    });

    // Switch dino — top-right, clear of the HUD text.
    const ids: Hero['id'][] = ['trik', 'stego', 'brachio'];
    const emojis = ['🦖', '🐢', '🦕'];
    ids.forEach((id, k) => {
      this.touchButton(VIEW_W - 206 + k * 66, 52, 29, emojis[k]!, {
        onPress: () => this.setActive(this.indexOf(id)),
      });
    });

    // Follow toggle (left of the switch buttons).
    this.touchButton(VIEW_W - 286, 52, 29, '👣', {
      onPress: () => {
        this.followMode = !this.followMode;
        this.updateHud();
      },
    });
  }

  private puff(x: number, y: number) {
    const c = this.add.circle(x, y, 7, 0xffffff, 0.7).setDepth(4);
    this.tweens.add({ targets: c, scale: 2.2, alpha: 0, duration: 280, onComplete: () => c.destroy() });
  }

  private getActive() {
    return this.heroes[this.active]!;
  }

  private setActive(i: number) {
    if (i === this.active || i < 0 || i >= this.heroes.length) return;
    // Reset crawl on the hero we're leaving.
    this.setCrawling(false);
    this.active = i;
    // Reset jump state so the newly-controlled dino doesn't inherit coyote/buffer.
    this.jumpBufferedAt = -9999;
    this.lastGroundedAt = -9999;
    this.wasGrounded = (this.getActive().box.body as Body).blocked.down;
    this.cameras.main.startFollow(this.getActive().box, true, 0.12, 0.12);
    this.updateHud();
  }

  private setCrawling(on: boolean) {
    if (on === this.crawling) return;
    this.crawling = on;
    const body = this.getActive().box.body as Body;
    if (on) {
      body.setSize(PLAYER_W, CRAWL_H);
      body.setOffset(0, NORMAL_H - CRAWL_H);
    } else {
      body.setSize(PLAYER_W, NORMAL_H);
      body.setOffset(0, 0);
    }
  }

  private updateHud() {
    const checklist = this.heroes.map((h) => `${h.emoji}${h.home ? '✓' : '·'}`).join(' ');
    this.hud.setText(
      `Playing: ${this.getActive().emoji} ${this.getActive().name}   Home: ${checklist}   ` +
        `Follow: ${this.followMode ? 'ON' : 'OFF'}\n` +
        `[1/2/3] switch · ←/→ move · ↑/Space jump · Shift = ability · ↓ crawl · F = follow`,
    );
  }

  private smash() {
    const a = this.getActive();
    let nearest: Phaser.GameObjects.Rectangle | null = null;
    let best = 70;
    for (const obj of this.breakables.getChildren()) {
      const b = obj as Phaser.GameObjects.Rectangle;
      const dx = b.x - a.box.x;
      if (Math.sign(dx) !== a.facing) continue;
      const dist = Math.hypot(dx, b.y - a.box.y);
      if (dist < best) {
        best = dist;
        nearest = b;
      }
    }
    if (nearest) {
      this.puff(nearest.x, nearest.y);
      this.breakables.remove(nearest, true, true);
    }
  }

  private dash() {
    const a = this.getActive();
    const body = a.box.body as Body;
    body.setAllowGravity(false);
    body.setVelocity(a.facing * 620, 0);
    this.puff(a.box.x, a.box.y + NORMAL_H / 2);
    this.time.delayedCall(300, () => body.setAllowGravity(true));
  }

  /** Best-effort auto-follow: walk toward the leader and hop small obstacles. */
  private followLeader(h: Hero, leader: Hero) {
    const body = h.box.body as Body;
    const dx = leader.box.x - h.box.x;
    if (Math.abs(dx) > 80) {
      const dir = dx < 0 ? -1 : 1;
      body.setVelocityX(dir * 175);
      h.facing = dir;
      const onGround = body.blocked.down;
      const blocked = (dir < 0 && body.blocked.left) || (dir > 0 && body.blocked.right);
      const leaderAbove = leader.box.y < h.box.y - 50 && Math.abs(dx) < 220;
      if (onGround && (blocked || leaderAbove)) body.setVelocityY(h.jump);
    } else {
      body.setVelocityX(0);
    }
  }

  private win() {
    if (this.won) return;
    this.won = true;
    // Freeze everyone so no one drifts after the win.
    this.heroes.forEach((h) => (h.box.body as Body).setVelocity(0, 0));
    this.banner.setText('🎉 All three dinos are home!\nGreat teamwork!').setAlpha(1);
  }

  override update(time: number) {
    // Switching.
    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE!)) this.setActive(this.indexOf('trik'));
    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO!)) this.setActive(this.indexOf('stego'));
    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE!)) this.setActive(this.indexOf('brachio'));
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q!)) this.setActive((this.active + 1) % this.heroes.length);
    if (Phaser.Input.Keyboard.JustDown(this.keys.F!)) {
      this.followMode = !this.followMode;
      this.updateHud();
    }

    const a = this.getActive();
    const body = a.box.body as Body;
    const onGround = body.blocked.down;

    if (onGround) this.lastGroundedAt = time;
    if (onGround && !this.wasGrounded && !this.won) {
      this.puff(a.box.x, a.box.y + NORMAL_H / 2); // landing dust
    }
    this.wasGrounded = onGround;

    if (a.box.y > WORLD_H + 60) {
      body.setVelocity(0, 0);
      a.box.setPosition(a.start.x, a.start.y);
    }

    if (!this.won) {
      const left = this.cursors.left.isDown || this.keys.A!.isDown || this.touch.left;
      const right = this.cursors.right.isDown || this.keys.D!.isDown || this.touch.right;
      const downHeld = this.cursors.down.isDown || this.keys.S!.isDown || this.touch.down;

      this.setCrawling(downHeld && onGround);

      const dashing = time < this.dashEndAt;
      if (!dashing) {
        const speed = this.crawling ? CRAWL_SPEED : RUN_SPEED;
        body.setVelocityX(0);
        if (left) {
          body.setVelocityX(-speed);
          a.facing = -1;
        } else if (right) {
          body.setVelocityX(speed);
          a.facing = 1;
        }
      }

      // Mario-tight jump: buffer the press, allow coyote time, and cut height on release.
      if (
        Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        Phaser.Input.Keyboard.JustDown(this.keys.W!) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
        this.touch.jumpPressed
      ) {
        this.jumpBufferedAt = time;
      }
      this.touch.jumpPressed = false; // consume the edge
      const jumpHeld =
        this.cursors.up.isDown ||
        this.keys.W!.isDown ||
        this.cursors.space.isDown ||
        this.touch.jumpDown;
      const canJump = (onGround || time - this.lastGroundedAt <= COYOTE_MS) && !this.crawling;
      if (canJump && time - this.jumpBufferedAt <= JUMP_BUFFER_MS) {
        body.setVelocityY(a.jump);
        this.jumpBufferedAt = -9999;
        this.lastGroundedAt = -9999; // consume coyote so we can't double-jump
        this.puff(a.box.x, a.box.y + NORMAL_H / 2);
      }
      if (!jumpHeld && body.velocity.y < 0) {
        body.setVelocityY(body.velocity.y * JUMP_CUT); // short hop on early release
      }

      // Ability (Shift or the ★ button): Trik dashes, Stego smashes. (Brachio's ability is the high jump.)
      const abilityEdge =
        Phaser.Input.Keyboard.JustDown(this.cursors.shift) || this.touch.abilityPressed;
      this.touch.abilityPressed = false; // consume the edge
      if (abilityEdge && !this.crawling) {
        if (a.id === 'trik' && time > this.dashReadyAt) {
          this.dashReadyAt = time + 700;
          this.dashEndAt = time + 300;
          this.dash();
        } else if (a.id === 'stego' && time > this.smashReadyAt) {
          this.smashReadyAt = time + 400;
          this.smash();
        }
      }
    }

    // Non-active dinos: freeze on win; otherwise follow the leader (if follow mode) or wait.
    const leader = this.getActive();
    this.heroes.forEach((h, i) => {
      if (i === this.active) return;
      if (this.won) {
        (h.box.body as Body).setVelocityX(0);
      } else if (this.followMode) {
        this.followLeader(h, leader);
      } else {
        (h.box.body as Body).setVelocityX(0);
      }
    });

    // Door delivery (latch home once reached).
    let allHome = true;
    for (const h of this.heroes) {
      if (!h.home && Math.abs(h.box.x - h.door.x) < 28 && Math.abs(h.box.y - h.door.y) < 44) {
        h.home = true;
        this.puff(h.door.x, h.door.y);
        this.updateHud();
      }
      if (!h.home) allHome = false;
    }
    if (allHome && !this.won) this.win();

    // Render all heroes; dim the inactive ones.
    this.heroes.forEach((h, i) => {
      const isActive = i === this.active;
      const crawl = isActive && this.crawling;
      h.sprite.setPosition(h.box.x, h.box.y + (crawl ? 8 : 0));
      h.sprite.setScale(h.facing === 1 ? -1 : 1, crawl ? 0.7 : 1);
      h.sprite.setAlpha(isActive ? 1 : 0.55);
    });
  }

  private indexOf(id: Hero['id']) {
    return this.heroes.findIndex((h) => h.id === id);
  }
}

export function createExpedition(parent: HTMLDivElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#bae6fd',
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GRAVITY_Y }, debug: false } },
    scene: ExpeditionScene,
    render: { roundPixels: true, antialias: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
}

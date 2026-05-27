import * as Phaser from 'phaser';

const WORLD_W = 2800;
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
const DASH_VELOCITY = 620;

// Mario-tight jump tuning.
const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 120;
const JUMP_CUT = 0.45;

type Body = Phaser.Physics.Arcade.Body;
type AbilityId = 'dash' | 'smash' | 'highjump';

interface CharDef {
  id: 'trik' | 'stego' | 'brachio';
  name: string;
  emoji: string;
  color: number;
  jump: number;
  ability: AbilityId;
  abilityLabel: string;
}

const CHARACTERS: CharDef[] = [
  { id: 'trik', name: 'Trik', emoji: '🦖', color: 0xfacc15, jump: -560, ability: 'dash', abilityLabel: '⚡ Dash' },
  { id: 'stego', name: 'Stego', emoji: '🐢', color: 0x38bdf8, jump: -560, ability: 'smash', abilityLabel: '🛡️ Smash' },
  { id: 'brachio', name: 'Brachiosaurus', emoji: '🦕', color: 0xfb923c, jump: -760, ability: 'highjump', abilityLabel: '🔭 High jump' },
];

class ExpeditionScene extends Phaser.Scene {
  private started = false;
  private def!: CharDef;
  private box!: Phaser.GameObjects.Rectangle;
  private sprite!: Phaser.GameObjects.Text;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private breakables!: Phaser.Physics.Arcade.StaticGroup;
  private gemsGroup!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private facing = 1;
  private crawling = false;
  private dashEndAt = 0;
  private dashReadyAt = 0;
  private smashReadyAt = 0;
  private lastGroundedAt = 0;
  private jumpBufferedAt = -9999;
  private wasGrounded = true;
  private gems = 0;
  private totalGems = 0;
  private won = false;
  private spawn = { x: 90, y: GROUND_TOP - 80 };
  private touch = { left: false, right: false, down: false, jumpDown: false, jumpPressed: false, abilityPressed: false };

  constructor() {
    super('expedition');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#bae6fd');
    this.cameras.main.setRoundPixels(true);

    this.buildParallax();
    this.buildLevel();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.showCharacterSelect();
  }

  // ─── Level ───────────────────────────────────────────────────
  private addSolid(x: number, y: number, w: number, h: number, fill = 0x65a30d, stroke = 0x4d7c0f) {
    this.solids.add(this.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke));
  }

  private addGem(x: number, y: number) {
    this.gemsGroup.add(this.add.text(x, y, '💎', { fontSize: '24px' }).setOrigin(0.5).setResolution(2));
    this.totalGems += 1;
  }

  private buildLevel() {
    this.solids = this.physics.add.staticGroup();
    this.breakables = this.physics.add.staticGroup();
    this.gemsGroup = this.physics.add.group({ allowGravity: false });

    // Continuous ground (no pits — gentle for young kids).
    this.addSolid(WORLD_W / 2, GROUND_TOP + (WORLD_H - GROUND_TOP) / 2, WORLD_W, WORLD_H - GROUND_TOP, 0x3f6212, 0x365314);

    // Step platforms (jump up for gems).
    this.addSolid(520, 470, 150, 22);
    this.addGem(520, 430);
    this.addSolid(770, 410, 140, 22);
    this.addGem(770, 370);

    // Trik bonus: two platforms with a wide gap to dash across (fall lands safely on ground).
    this.addSolid(1120, 430, 130, 22);
    this.addSolid(1430, 430, 130, 22);
    this.addGem(1430, 392);

    // Brachiosaurus bonus: a high platform only the high jump reaches.
    this.addSolid(1780, 300, 150, 22);
    this.addGem(1780, 268);

    // Stego bonus: a sealed alcove; only smashing the cracked block reaches the gem.
    this.addSolid(2240, 470, 40, 100, 0x57534e, 0x44403c); // back wall
    this.addSolid(2185, 430, 150, 20, 0x57534e, 0x44403c); // ceiling
    this.addBreakable(2120, 500, 40, 70);
    this.addGem(2160, 510);

    // Ground gems.
    this.addGem(300, 500);
    this.addGem(1000, 505);

    // Required crawl: a tall overhang you can't jump over — everyone crawls under.
    this.addSolid(2430, 405, 200, 210, 0x7c2d12, 0x5b2110);

    // Goal nest.
    const goal = this.add.text(2700, GROUND_TOP - 24, '🪺', { fontSize: '34px' }).setOrigin(0.5).setResolution(2);
    this.physics.add.existing(goal, true);
    this.goal = goal;
  }

  private goal!: Phaser.GameObjects.Text;

  private addBreakable(x: number, y: number, w: number, h: number) {
    this.breakables.add(this.add.rectangle(x, y, w, h, 0xa16207).setStrokeStyle(3, 0x713f12));
    this.add.text(x, y, '✶', { fontSize: '16px', color: '#fde68a' }).setOrigin(0.5);
  }

  private buildParallax() {
    for (let i = 0; i < 9; i++) {
      this.add.ellipse(200 + i * 320, 90 + (i % 3) * 30, 140, 50, 0xffffff, 0.7).setScrollFactor(0.2).setDepth(-3);
    }
    for (let i = 0; i < 9; i++) {
      this.add.ellipse(150 + i * 380, 560, 520, 360, 0x86efac, 0.6).setScrollFactor(0.35).setDepth(-2);
    }
    for (let i = 0; i < 10; i++) {
      this.add.ellipse(i * 330, 600, 420, 320, 0x4ade80, 0.6).setScrollFactor(0.6).setDepth(-1);
    }
  }

  // ─── Character select ────────────────────────────────────────
  private showCharacterSelect() {
    const cx = VIEW_W / 2;
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(30);
    const dim = this.add.rectangle(cx, VIEW_H / 2, VIEW_W, VIEW_H, 0x0f172a, 0.78).setScrollFactor(0);
    const title = this.add
      .text(cx, 150, 'Choose your dino', { fontSize: '44px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    overlay.add([dim, title]);

    CHARACTERS.forEach((c, i) => {
      const x = cx - 320 + i * 320;
      const y = VIEW_H / 2 + 20;
      const card = this.add.rectangle(x, y, 240, 260, 0xffffff, 0.12).setStrokeStyle(4, c.color).setScrollFactor(0).setInteractive();
      const emoji = this.add.text(x, y - 50, c.emoji, { fontSize: '72px' }).setOrigin(0.5).setResolution(2).setScrollFactor(0);
      const name = this.add.text(x, y + 50, c.name, { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0);
      const abil = this.add.text(x, y + 88, c.abilityLabel, { fontSize: '18px', color: '#a7f3d0' }).setOrigin(0.5).setScrollFactor(0);
      card.on('pointerover', () => card.setFillStyle(0xffffff, 0.25));
      card.on('pointerout', () => card.setFillStyle(0xffffff, 0.12));
      card.on('pointerdown', () => {
        overlay.destroy();
        this.startGame(c);
      });
      overlay.add([card, emoji, name, abil]);
    });
  }

  private startGame(def: CharDef) {
    this.def = def;

    this.box = this.add.rectangle(this.spawn.x, this.spawn.y, PLAYER_W, NORMAL_H, 0x000000, 0);
    this.physics.add.existing(this.box);
    (this.box.body as Body).setCollideWorldBounds(false);
    this.physics.add.collider(this.box, this.solids);
    this.physics.add.collider(this.box, this.breakables);

    this.sprite = this.add.text(this.spawn.x, this.spawn.y, def.emoji, { fontSize: '44px' }).setOrigin(0.5).setResolution(2).setDepth(5);

    this.physics.add.overlap(this.box, this.gemsGroup, (_b, gem) => {
      const g = gem as Phaser.GameObjects.Text;
      this.sparkle(g.x, g.y);
      g.destroy();
      this.gems += 1;
      this.updateHud();
    });
    this.physics.add.overlap(this.box, this.goal, () => this.win());

    this.cameras.main.startFollow(this.box, true, 0.12, 0.12);

    this.hud = this.add.text(12, 10, '', { fontSize: '16px', color: '#0f172a', fontStyle: 'bold' }).setScrollFactor(0).setDepth(10);
    this.updateHud();

    this.banner = this.add
      .text(VIEW_W / 2, VIEW_H * 0.4, '', { fontSize: '22px', color: '#ffffff', backgroundColor: '#065f46', padding: { x: 16, y: 10 }, align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11)
      .setAlpha(0);

    const isTouch =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) {
      this.input.addPointer(3);
      this.createTouchControls();
    }

    this.started = true;
  }

  // ─── Touch controls ──────────────────────────────────────────
  private touchButton(x: number, y: number, r: number, label: string, h: { onDown?: () => void; onUp?: () => void; onPress?: () => void }) {
    const c = this.add.circle(x, y, r, 0xffffff, 0.22).setScrollFactor(0).setDepth(20).setStrokeStyle(3, 0xffffff, 0.55).setInteractive();
    this.add.text(x, y, label, { fontSize: `${Math.round(r)}px` }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    const press = () => {
      c.setFillStyle(0xffffff, 0.42);
      h.onDown?.();
      h.onPress?.();
    };
    const release = () => {
      c.setFillStyle(0xffffff, 0.22);
      h.onUp?.();
    };
    c.on('pointerdown', press);
    c.on('pointerup', release);
    c.on('pointerout', release);
    c.on('pointerupoutside', release);
  }

  private createTouchControls() {
    const bottom = VIEW_H - 96;
    this.touchButton(108, bottom, 48, '◀', { onDown: () => (this.touch.left = true), onUp: () => (this.touch.left = false) });
    this.touchButton(234, bottom, 48, '▶', { onDown: () => (this.touch.right = true), onUp: () => (this.touch.right = false) });
    this.touchButton(VIEW_W - 112, bottom, 56, '▲', {
      onDown: () => {
        this.touch.jumpDown = true;
        this.touch.jumpPressed = true;
      },
      onUp: () => (this.touch.jumpDown = false),
    });
    this.touchButton(VIEW_W - 246, bottom, 44, '▼', { onDown: () => (this.touch.down = true), onUp: () => (this.touch.down = false) });
    // Ability button only for the dinos with an on-demand ability (Brachio's is the passive high jump).
    if (this.def.ability !== 'highjump') {
      this.touchButton(VIEW_W - 150, bottom - 142, 46, '★', { onPress: () => (this.touch.abilityPressed = true) });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private sparkle(x: number, y: number) {
    const s = this.add.text(x, y, '✨', { fontSize: '20px' }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: s, y: y - 26, alpha: 0, duration: 480, onComplete: () => s.destroy() });
  }

  private puff(x: number, y: number) {
    const c = this.add.circle(x, y, 7, 0xffffff, 0.7).setDepth(4);
    this.tweens.add({ targets: c, scale: 2.2, alpha: 0, duration: 280, onComplete: () => c.destroy() });
  }

  private updateHud() {
    this.hud.setText(
      `${this.def.emoji} ${this.def.name}   💎 ${this.gems}/${this.totalGems}\n` +
        `←/→ move · ↑/Space jump · ↓ crawl${this.def.ability !== 'highjump' ? ` · Shift = ${this.def.abilityLabel}` : ''}`,
    );
  }

  private setCrawling(on: boolean) {
    if (on === this.crawling) return;
    this.crawling = on;
    const body = this.box.body as Body;
    if (on) {
      body.setSize(PLAYER_W, CRAWL_H);
      body.setOffset(0, NORMAL_H - CRAWL_H);
    } else {
      body.setSize(PLAYER_W, NORMAL_H);
      body.setOffset(0, 0);
    }
  }

  private smash() {
    let nearest: Phaser.GameObjects.Rectangle | null = null;
    let best = 70;
    for (const obj of this.breakables.getChildren()) {
      const b = obj as Phaser.GameObjects.Rectangle;
      const dx = b.x - this.box.x;
      if (Math.sign(dx) !== this.facing) continue;
      const dist = Math.hypot(dx, b.y - this.box.y);
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
    const body = this.box.body as Body;
    body.setAllowGravity(false);
    body.setVelocity(this.facing * DASH_VELOCITY, 0);
    this.puff(this.box.x, this.box.y + NORMAL_H / 2);
    this.time.delayedCall(280, () => body.setAllowGravity(true));
  }

  private win() {
    if (this.won) return;
    this.won = true;
    (this.box.body as Body).setVelocity(0, 0);
    this.banner.setText(`🎉 You reached the nest!\n💎 ${this.gems}/${this.totalGems} gems`).setAlpha(1);
  }

  override update(time: number) {
    if (!this.started || this.won) {
      if (this.won) (this.box.body as Body).setVelocityX(0);
      return;
    }

    const body = this.box.body as Body;
    const onGround = body.blocked.down;

    if (onGround) this.lastGroundedAt = time;
    if (onGround && !this.wasGrounded) this.puff(this.box.x, this.box.y + NORMAL_H / 2);
    this.wasGrounded = onGround;

    const left = this.cursors.left.isDown || this.keys.A!.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.keys.D!.isDown || this.touch.right;
    const downHeld = this.cursors.down.isDown || this.keys.S!.isDown || this.touch.down;

    this.setCrawling(downHeld && onGround);

    if (time >= this.dashEndAt) {
      const speed = this.crawling ? CRAWL_SPEED : RUN_SPEED;
      body.setVelocityX(0);
      if (left) {
        body.setVelocityX(-speed);
        this.facing = -1;
      } else if (right) {
        body.setVelocityX(speed);
        this.facing = 1;
      }
    }

    // Mario-tight jump.
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W!) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      this.touch.jumpPressed
    ) {
      this.jumpBufferedAt = time;
    }
    this.touch.jumpPressed = false;
    const jumpHeld = this.cursors.up.isDown || this.keys.W!.isDown || this.cursors.space.isDown || this.touch.jumpDown;
    const canJump = (onGround || time - this.lastGroundedAt <= COYOTE_MS) && !this.crawling;
    if (canJump && time - this.jumpBufferedAt <= JUMP_BUFFER_MS) {
      body.setVelocityY(this.def.jump);
      this.jumpBufferedAt = -9999;
      this.lastGroundedAt = -9999;
      this.puff(this.box.x, this.box.y + NORMAL_H / 2);
    }
    if (!jumpHeld && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * JUMP_CUT);
    }

    // Ability (Shift or ★): dash (Trik) or smash (Stego). Brachio's ability is the high jump above.
    const abilityEdge = Phaser.Input.Keyboard.JustDown(this.cursors.shift) || this.touch.abilityPressed;
    this.touch.abilityPressed = false;
    if (abilityEdge && !this.crawling) {
      if (this.def.ability === 'dash' && time > this.dashReadyAt) {
        this.dashReadyAt = time + 700;
        this.dashEndAt = time + 280;
        this.dash();
      } else if (this.def.ability === 'smash' && time > this.smashReadyAt) {
        this.smashReadyAt = time + 400;
        this.smash();
      }
    }

    // Visual follows physics; emoji faces movement; crouch squashes.
    this.sprite.setPosition(this.box.x, this.box.y + (this.crawling ? 8 : 0));
    this.sprite.setScale(this.facing === 1 ? -1 : 1, this.crawling ? 0.7 : 1);
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

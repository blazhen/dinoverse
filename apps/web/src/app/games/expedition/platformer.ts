import * as Phaser from 'phaser';

const WORLD_W = 2600;
const WORLD_H = 600;
const GROUND_TOP = 540;

const PLAYER_W = 34;
const NORMAL_H = 46;
const CRAWL_H = 26;

const RUN_SPEED = 210;
const CRAWL_SPEED = 95;
const GRAVITY_Y = 1100;

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
  private won = false;

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

    // Continuous ground (no pits — heroes can always walk to each gate).
    this.addSolid(WORLD_W / 2, GROUND_TOP + 30, WORLD_W, 60, 0x3f6212, 0x365314);

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
      .text(400, 200, '', {
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
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,Q') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

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
      `Playing: ${this.getActive().emoji} ${this.getActive().name}   Home: ${checklist}\n` +
        `[1/2/3] switch · ←/→ move · ↑/Space jump · Shift = ability · ↓ crawl`,
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

  private win() {
    if (this.won) return;
    this.won = true;
    this.banner.setText('🎉 All three dinos are home!\nGreat teamwork!').setAlpha(1);
  }

  override update(time: number) {
    // Switching.
    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE!)) this.setActive(this.indexOf('trik'));
    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO!)) this.setActive(this.indexOf('stego'));
    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE!)) this.setActive(this.indexOf('brachio'));
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q!)) this.setActive((this.active + 1) % this.heroes.length);

    const a = this.getActive();
    const body = a.box.body as Body;
    const onGround = body.blocked.down;

    if (a.box.y > WORLD_H + 60) {
      body.setVelocity(0, 0);
      a.box.setPosition(a.start.x, a.start.y);
    }

    if (!this.won) {
      const left = this.cursors.left.isDown || this.keys.A!.isDown;
      const right = this.cursors.right.isDown || this.keys.D!.isDown;
      const downHeld = this.cursors.down.isDown || this.keys.S!.isDown;

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

      const jumpPressed =
        Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        Phaser.Input.Keyboard.JustDown(this.keys.W!) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.space);
      if (jumpPressed && onGround && !this.crawling) {
        body.setVelocityY(a.jump);
        this.puff(a.box.x, a.box.y + NORMAL_H / 2);
      }

      // Ability on Shift: Trik dashes, Stego smashes. (Brachio's ability is the high jump.)
      if (Phaser.Input.Keyboard.JustDown(this.cursors.shift) && !this.crawling) {
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

    // Inactive heroes stand still.
    this.heroes.forEach((h, i) => {
      if (i !== this.active) (h.box.body as Body).setVelocityX(0);
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
    width: 800,
    height: 450,
    backgroundColor: '#bae6fd',
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GRAVITY_Y }, debug: false } },
    scene: ExpeditionScene,
    render: { roundPixels: true, antialias: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  });
}

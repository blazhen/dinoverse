import * as Phaser from 'phaser';

import { generateLevel, GROUND_TOP, type LevelSpec, WORLD_H } from './level-gen';

const VIEW_W = 1280;
const VIEW_H = 720;

const PLAYER_W = 34;
const NORMAL_H = 46;
const CRAWL_H = 26;

const RUN_SPEED = 210;
const CRAWL_SPEED = 95;
const GRAVITY_Y = 1100;
const DASH_VELOCITY = 620;

const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 120;
const JUMP_CUT = 0.45;

type Body = Phaser.Physics.Arcade.Body;
type AbilityId = 'dash' | 'smash' | 'highjump';
type CharId = 'trik' | 'stego' | 'brachio';

interface CharDef {
  id: CharId;
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

interface InitData {
  level?: number;
  charId?: CharId;
}

class ExpeditionScene extends Phaser.Scene {
  private level = 1;
  private pendingCharId: CharId | null = null;
  private spec!: LevelSpec;
  private started = false;
  private def!: CharDef;
  private box!: Phaser.GameObjects.Rectangle;
  private sprite!: Phaser.GameObjects.Text;
  private goal!: Phaser.GameObjects.Text;
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
  private touch = { left: false, right: false, down: false, jumpDown: false, jumpPressed: false, abilityPressed: false };

  constructor() {
    super('expedition');
  }

  init(data: InitData) {
    this.level = data.level ?? 1;
    this.pendingCharId = data.charId ?? null;
    // Reset transient state (scene.restart reuses the instance).
    this.started = false;
    this.won = false;
    this.gems = 0;
    this.totalGems = 0;
    this.crawling = false;
    this.facing = 1;
    this.jumpBufferedAt = -9999;
    this.touch = { left: false, right: false, down: false, jumpDown: false, jumpPressed: false, abilityPressed: false };
  }

  create() {
    this.spec = generateLevel(this.level);

    this.physics.world.setBounds(0, 0, this.spec.worldW, WORLD_H);
    this.cameras.main.setBounds(0, 0, this.spec.worldW, WORLD_H);
    this.cameras.main.setBackgroundColor('#bae6fd');
    this.cameras.main.setRoundPixels(true);

    this.buildParallax(this.spec.worldW);
    this.buildLevel(this.spec);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    const def = CHARACTERS.find((c) => c.id === this.pendingCharId);
    if (def) this.startGame(def);
    else this.showCharacterSelect();
  }

  // ─── Level build (from generated spec) ───────────────────────
  private buildLevel(spec: LevelSpec) {
    this.solids = this.physics.add.staticGroup();
    this.breakables = this.physics.add.staticGroup();
    this.gemsGroup = this.physics.add.group({ allowGravity: false });

    // Continuous ground spanning the level.
    this.solids.add(
      this.add
        .rectangle(spec.worldW / 2, GROUND_TOP + (WORLD_H - GROUND_TOP) / 2, spec.worldW, WORLD_H - GROUND_TOP, 0x3f6212)
        .setStrokeStyle(2, 0x365314),
    );

    for (const r of spec.solids) {
      this.solids.add(this.add.rectangle(r.x, r.y, r.w, r.h, r.fill).setStrokeStyle(2, r.stroke));
    }
    for (const b of spec.breakables) {
      this.breakables.add(this.add.rectangle(b.x, b.y, b.w, b.h, 0xa16207).setStrokeStyle(3, 0x713f12));
      this.add.text(b.x, b.y, '✶', { fontSize: '16px', color: '#fde68a' }).setOrigin(0.5);
    }
    for (const g of spec.gems) {
      this.gemsGroup.add(this.add.text(g.x, g.y, '💎', { fontSize: '24px' }).setOrigin(0.5).setResolution(2));
    }
    this.totalGems = spec.gems.length;

    this.goal = this.add.text(spec.goal.x, spec.goal.y, '🪺', { fontSize: '34px' }).setOrigin(0.5).setResolution(2);
    this.physics.add.existing(this.goal, true);
  }

  private buildParallax(worldW: number) {
    const clouds = Math.ceil(worldW / 320) + 2;
    for (let i = 0; i < clouds; i++) {
      this.add.ellipse(200 + i * 320, 90 + (i % 3) * 30, 140, 50, 0xffffff, 0.7).setScrollFactor(0.2).setDepth(-3);
    }
    const hills = Math.ceil(worldW / 360) + 2;
    for (let i = 0; i < hills; i++) {
      this.add.ellipse(150 + i * 380, 560, 520, 360, 0x86efac, 0.6).setScrollFactor(0.35).setDepth(-2);
      this.add.ellipse(i * 330, 600, 420, 320, 0x4ade80, 0.6).setScrollFactor(0.6).setDepth(-1);
    }
  }

  // ─── Character select ────────────────────────────────────────
  private showCharacterSelect() {
    const cx = VIEW_W / 2;
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(30);
    overlay.add(this.add.rectangle(cx, VIEW_H / 2, VIEW_W, VIEW_H, 0x0f172a, 0.78).setScrollFactor(0));
    overlay.add(
      this.add.text(cx, 150, 'Choose your dino', { fontSize: '44px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0),
    );

    CHARACTERS.forEach((c, i) => {
      const x = cx - 320 + i * 320;
      const y = VIEW_H / 2 + 20;
      const card = this.add.rectangle(x, y, 240, 260, 0xffffff, 0.12).setStrokeStyle(4, c.color).setScrollFactor(0).setInteractive();
      card.on('pointerover', () => card.setFillStyle(0xffffff, 0.25));
      card.on('pointerout', () => card.setFillStyle(0xffffff, 0.12));
      card.on('pointerdown', () => {
        overlay.destroy();
        this.startGame(c);
      });
      overlay.add([
        card,
        this.add.text(x, y - 50, c.emoji, { fontSize: '72px' }).setOrigin(0.5).setResolution(2).setScrollFactor(0),
        this.add.text(x, y + 50, c.name, { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0),
        this.add.text(x, y + 88, c.abilityLabel, { fontSize: '18px', color: '#a7f3d0' }).setOrigin(0.5).setScrollFactor(0),
      ]);
    });
  }

  private startGame(def: CharDef) {
    this.def = def;
    this.pendingCharId = def.id;

    this.box = this.add.rectangle(this.spec.spawn.x, this.spec.spawn.y, PLAYER_W, NORMAL_H, 0x000000, 0);
    this.physics.add.existing(this.box);
    (this.box.body as Body).setCollideWorldBounds(false);
    this.physics.add.collider(this.box, this.solids);
    this.physics.add.collider(this.box, this.breakables);

    this.sprite = this.add.text(this.spec.spawn.x, this.spec.spawn.y, def.emoji, { fontSize: '44px' }).setOrigin(0.5).setResolution(2).setDepth(5);

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
      .text(VIEW_W / 2, VIEW_H * 0.38, '', { fontSize: '22px', color: '#ffffff', backgroundColor: '#065f46', padding: { x: 16, y: 10 }, align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11)
      .setAlpha(0);

    const isTouch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
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
      `Level ${this.level}   ${this.def.emoji} ${this.def.name}   💎 ${this.gems}/${this.totalGems}\n` +
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
    this.banner.setText(`🎉 Level ${this.level} complete!   💎 ${this.gems}/${this.totalGems}\nTap / Space for the next level ▶`).setAlpha(1);

    const btn = this.add
      .text(VIEW_W / 2, VIEW_H * 0.55, '  Next level ▶  ', { fontSize: '22px', color: '#065f46', backgroundColor: '#ffffff', padding: { x: 18, y: 12 }, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31)
      .setInteractive();
    btn.on('pointerdown', () => this.nextLevel());
  }

  private nextLevel() {
    this.scene.restart({ level: this.level + 1, charId: this.def.id });
  }

  override update(time: number) {
    if (!this.started) return;

    const body = this.box.body as Body;

    if (this.won) {
      body.setVelocityX(0);
      const advance =
        Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        this.touch.jumpPressed;
      this.touch.jumpPressed = false;
      if (advance) this.nextLevel();
      return;
    }

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

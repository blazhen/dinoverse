import * as Phaser from 'phaser';

const WORLD_W = 3000;
const WORLD_H = 600;
const GROUND_TOP = 540;

const PLAYER_W = 34;
const NORMAL_H = 46;
const CRAWL_H = 26;

const RUN_SPEED = 210;
const CRAWL_SPEED = 95;
const JUMP_VELOCITY = -560; // tuned down — snappier, less floaty
const DASH_VELOCITY = 540;
const GRAVITY_Y = 1100;

type Body = Phaser.Physics.Arcade.Body;

class ExpeditionScene extends Phaser.Scene {
  private box!: Phaser.GameObjects.Rectangle;
  private sprite!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private facing = 1;
  private crawling = false;
  private dashEndAt = 0;
  private dashReadyAt = 0;
  private gems = 0;
  private totalGems = 0;
  private won = false;
  private wasOnGround = true;
  private readonly spawn = { x: 90, y: GROUND_TOP - 80 };

  constructor() {
    super('expedition');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#bae6fd');
    this.cameras.main.setRoundPixels(true); // crisp scrolling — kills the moving-blur

    this.buildParallax();

    const solids = this.physics.add.staticGroup();
    const ground: [number, number][] = [
      [450, 900],
      [1375, 650],
      [2410, 1180],
    ];
    for (const [cx, w] of ground) {
      const r = this.add.rectangle(cx, GROUND_TOP + 30, w, 60, 0x3f6212).setStrokeStyle(2, 0x365314);
      solids.add(r);
    }

    // Reachable platforms (apex ~142px; all within ~120px rise).
    const platforms: [number, number, number][] = [
      [560, 478, 150],
      [820, 430, 150],
      [1080, 478, 150],
      [1500, 450, 160],
      [2120, 450, 160],
    ];
    for (const [x, y, w] of platforms) {
      const r = this.add.rectangle(x, y, w, 22, 0x65a30d).setStrokeStyle(2, 0x4d7c0f);
      solids.add(r);
    }

    const overhang = this.add.rectangle(2350, 480, 220, 60, 0x7c2d12).setStrokeStyle(2, 0x5b2110);
    solids.add(overhang);

    this.box = this.add.rectangle(this.spawn.x, this.spawn.y, PLAYER_W, NORMAL_H, 0x000000, 0);
    this.physics.add.existing(this.box);
    (this.box.body as Body).setCollideWorldBounds(false);
    this.physics.add.collider(this.box, solids);

    this.sprite = this.add
      .text(this.spawn.x, this.spawn.y, '🦖', { fontSize: '44px' })
      .setOrigin(0.5)
      .setResolution(2) // sharper glyph when scaled/flipped
      .setDepth(5);

    const gemGroup = this.physics.add.group({ allowGravity: false });
    const gemSpots: [number, number][] = [
      [560, 437],
      [820, 389],
      [1080, 437],
      [700, 500],
      [1500, 409],
      [2120, 409],
      [2700, 505],
    ];
    this.totalGems = gemSpots.length;
    for (const [x, y] of gemSpots) {
      gemGroup.add(this.add.text(x, y, '💎', { fontSize: '24px' }).setOrigin(0.5).setResolution(2));
    }
    this.physics.add.overlap(this.box, gemGroup, (_b, gem) => {
      const g = gem as Phaser.GameObjects.Text;
      this.sparkle(g.x, g.y);
      g.destroy();
      this.gems += 1;
      this.updateHud();
    });

    const goal = this.add
      .text(2900, GROUND_TOP - 24, '🪺', { fontSize: '34px' })
      .setOrigin(0.5)
      .setResolution(2);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.box, goal, () => this.win());

    this.cameras.main.startFollow(this.box, true, 0.12, 0.12);

    this.hud = this.add
      .text(12, 10, '', { fontSize: '15px', color: '#0f172a', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(10);
    this.updateHud();

    this.banner = this.add
      .text(400, 210, '', {
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
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  /** Layered, low-scroll-factor shapes for depth. Asset-free parallax. */
  private buildParallax() {
    // Distant clouds.
    for (let i = 0; i < 10; i++) {
      const x = 200 + i * 320;
      this.add.ellipse(x, 90 + (i % 3) * 30, 140, 50, 0xffffff, 0.7).setScrollFactor(0.2).setDepth(-3);
    }
    // Far hills.
    for (let i = 0; i < 8; i++) {
      this.add
        .ellipse(150 + i * 420, 560, 520, 360, 0x86efac, 0.6)
        .setScrollFactor(0.35)
        .setDepth(-2);
    }
    // Near hills.
    for (let i = 0; i < 10; i++) {
      this.add
        .ellipse(0 + i * 360, 600, 420, 320, 0x4ade80, 0.6)
        .setScrollFactor(0.6)
        .setDepth(-1);
    }
  }

  private sparkle(x: number, y: number) {
    const s = this.add.text(x, y, '✨', { fontSize: '20px' }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: s, y: y - 26, alpha: 0, duration: 480, onComplete: () => s.destroy() });
  }

  private puff(x: number, y: number) {
    const c = this.add.circle(x, y, 7, 0xffffff, 0.7).setDepth(4);
    this.tweens.add({
      targets: c,
      scale: 2.2,
      alpha: 0,
      duration: 280,
      onComplete: () => c.destroy(),
    });
  }

  private updateHud() {
    this.hud.setText(
      `💎 ${this.gems}/${this.totalGems}   ←/→ move · ↑/Space jump · Shift dash · ↓ crawl`,
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

  private win() {
    if (this.won) return;
    this.won = true;
    this.banner
      .setText(`🎉 You reached the nest!\n💎 ${this.gems}/${this.totalGems} gems`)
      .setAlpha(1);
    (this.box.body as Body).setVelocity(0, 0);
  }

  private respawn() {
    const body = this.box.body as Body;
    body.setVelocity(0, 0);
    this.box.setPosition(this.spawn.x, this.spawn.y);
  }

  override update(time: number) {
    const body = this.box.body as Body;
    const onGround = body.blocked.down;

    if (!this.won && this.box.y > WORLD_H + 60) {
      this.respawn();
    }

    if (!this.won) {
      const left = this.cursors.left.isDown || this.wasd.A!.isDown;
      const right = this.cursors.right.isDown || this.wasd.D!.isDown;
      const downHeld = this.cursors.down.isDown || this.wasd.S!.isDown;

      this.setCrawling(downHeld && onGround);

      const dashing = time < this.dashEndAt;
      if (!dashing) {
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

      const jumpPressed =
        Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        Phaser.Input.Keyboard.JustDown(this.wasd.W!) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.space);
      if (jumpPressed && onGround && !this.crawling) {
        body.setVelocityY(JUMP_VELOCITY);
        this.puff(this.box.x, this.box.y + NORMAL_H / 2);
      }

      if (
        Phaser.Input.Keyboard.JustDown(this.cursors.shift) &&
        time > this.dashReadyAt &&
        !this.crawling
      ) {
        this.dashEndAt = time + 160;
        this.dashReadyAt = time + 800;
        body.setVelocityX(this.facing * DASH_VELOCITY);
        this.puff(this.box.x, this.box.y + NORMAL_H / 2);
      }
    }

    // Landing puff.
    if (onGround && !this.wasOnGround) {
      this.puff(this.box.x, this.box.y + NORMAL_H / 2);
    }
    this.wasOnGround = onGround;

    // Visual follows physics. Emoji faces LEFT by default → mirror when going right.
    const moving = Math.abs(body.velocity.x) > 5;
    const bob = onGround && moving && !this.crawling ? Math.sin(time / 80) * 2 : 0;
    this.sprite.setPosition(this.box.x, this.box.y + (this.crawling ? 8 : 0) + bob);
    this.sprite.setScale(this.facing === 1 ? -1 : 1, this.crawling ? 0.7 : 1);
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

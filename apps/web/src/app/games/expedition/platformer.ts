import * as Phaser from 'phaser';

const WORLD_W = 3000;
const WORLD_H = 600;
const GROUND_TOP = 540;

type Body = Phaser.Physics.Arcade.Body;

class ExpeditionScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Text;
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
  private readonly spawn = { x: 80, y: GROUND_TOP - 60 };

  constructor() {
    super('expedition');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Solid ground with two pits (gaps require jumping).
    const solids = this.physics.add.staticGroup();
    const ground: [number, number, number][] = [
      [450, 900, 0], // [centerX, width] (y derived)
      [1375, 650, 0],
      [2410, 1180, 0],
    ];
    for (const [cx, w] of ground) {
      const r = this.add.rectangle(cx, GROUND_TOP + 30, w, 60, 0x3f6212).setStrokeStyle(2, 0x365314);
      solids.add(r);
    }

    // Floating platforms.
    const platforms: [number, number, number][] = [
      [600, 400, 160],
      [1300, 350, 160],
      [2120, 380, 160],
    ];
    for (const [x, y, w] of platforms) {
      const r = this.add.rectangle(x, y, w, 22, 0x65a30d).setStrokeStyle(2, 0x4d7c0f);
      solids.add(r);
    }

    // Low overhang near the end — must crawl under it.
    const ceiling = this.add.rectangle(2300, 496, 240, 40, 0x7c2d12).setStrokeStyle(2, 0x5b2110);
    solids.add(ceiling);

    // Player (emoji dino) with gravity.
    this.player = this.add.text(this.spawn.x, this.spawn.y, '🦖', { fontSize: '30px' });
    this.physics.add.existing(this.player);
    const body = this.player.body as Body;
    body.setCollideWorldBounds(false);
    body.setSize(26, 32);
    this.physics.add.collider(this.player, solids);

    // Gems to collect.
    const gemGroup = this.physics.add.group({ allowGravity: false });
    const gemSpots: [number, number][] = [
      [600, 360],
      [1300, 310],
      [1000, 470],
      [1500, 470],
      [2120, 340],
      [2350, 510],
      [2700, 470],
    ];
    this.totalGems = gemSpots.length;
    for (const [x, y] of gemSpots) {
      const g = this.add.text(x, y, '💎', { fontSize: '22px' });
      gemGroup.add(g);
    }
    this.physics.add.overlap(this.player, gemGroup, (_p, gem) => {
      (gem as Phaser.GameObjects.Text).destroy();
      this.gems += 1;
      this.updateHud();
    });

    // Goal at the end.
    const goal = this.add.text(2900, GROUND_TOP - 36, '🪺', { fontSize: '32px' });
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player, goal, () => this.win());

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor('#bae6fd');

    this.hud = this.add
      .text(12, 10, '', { fontSize: '15px', color: '#0f172a', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(10);
    this.updateHud();

    this.banner = this.add
      .text(400, 230, '', {
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

  private updateHud() {
    this.hud.setText(
      `💎 ${this.gems}/${this.totalGems}   ←/→ move · ↑/Space jump · Shift dash · ↓ crawl`,
    );
  }

  private setCrawling(on: boolean) {
    if (on === this.crawling) return;
    this.crawling = on;
    const body = this.player.body as Body;
    if (on) {
      body.setSize(26, 18);
      body.setOffset(2, 16);
      this.player.setScale(1, 0.7);
    } else {
      body.setSize(26, 32);
      body.setOffset(0, 0);
      this.player.setScale(1, 1);
    }
  }

  private win() {
    if (this.won) return;
    this.won = true;
    this.banner.setText(`🎉 You reached the nest!\n💎 ${this.gems}/${this.totalGems} gems`).setAlpha(1);
    (this.player.body as Body).setVelocity(0, 0);
  }

  private respawn() {
    const body = this.player.body as Body;
    body.setVelocity(0, 0);
    this.player.setPosition(this.spawn.x, this.spawn.y);
  }

  override update(time: number) {
    if (this.won) return;
    const body = this.player.body as Body;

    if (this.player.y > WORLD_H + 60) {
      this.respawn();
      return;
    }

    const onGround = body.blocked.down;
    const left = this.cursors.left.isDown || this.wasd.A!.isDown;
    const right = this.cursors.right.isDown || this.wasd.D!.isDown;
    const downHeld = this.cursors.down.isDown || this.wasd.S!.isDown;

    this.setCrawling(downHeld && onGround);

    const dashing = time < this.dashEndAt;
    if (!dashing) {
      const speed = this.crawling ? 95 : 210;
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
      body.setVelocityY(-540);
    }

    const dashPressed = Phaser.Input.Keyboard.JustDown(this.cursors.shift);
    if (dashPressed && time > this.dashReadyAt && !this.crawling) {
      this.dashEndAt = time + 160;
      this.dashReadyAt = time + 800;
      body.setVelocityX(this.facing * 520);
      this.player.setAlpha(0.6);
      this.time.delayedCall(160, () => this.player.setAlpha(1));
    }
  }
}

export function createExpedition(parent: HTMLDivElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 800,
    height: 450,
    backgroundColor: '#bae6fd',
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1100 }, debug: false } },
    scene: ExpeditionScene,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  });
}

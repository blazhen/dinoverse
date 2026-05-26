import * as Phaser from 'phaser';

const WORLD_W = 1600;
const WORLD_H = 1200;

const FACTS = [
  'Brachiosaurus could reach leaves 9 metres up — like a 3-storey building!',
  'Some dinosaurs had feathers, not just scales.',
  'Stegosaurus had a brain about the size of a walnut.',
  'The word "dinosaur" means "terrible lizard".',
  'Velociraptors were only about the size of a turkey.',
  'Triceratops had up to 800 teeth!',
];

class ExploreScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private collected = 0;
  private total = 0;

  constructor() {
    super('explore');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // Ground grid — stand-in for the open world until the tilemap/art lands.
    this.add.grid(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 64, 64, 0x14532d, 1, 0x166534, 0.4);

    // Buildings of Dino City (static obstacles).
    const buildings = this.physics.add.staticGroup();
    const blocks: [number, number, number, number][] = [
      [300, 250, 120, 90],
      [700, 200, 160, 110],
      [1100, 350, 140, 120],
      [400, 700, 150, 100],
      [950, 800, 180, 130],
      [1300, 650, 120, 90],
    ];
    for (const [x, y, w, h] of blocks) {
      const r = this.add.rectangle(x, y, w, h, 0x334155).setStrokeStyle(3, 0x1e293b);
      buildings.add(r);
    }

    // Player — an emoji dino with an arcade body.
    this.player = this.add.text(120, 120, '🦖', { fontSize: '34px' });
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, buildings);

    // Collectible eggs that reveal a dino fact.
    const eggs = this.physics.add.group();
    const eggCoords: [number, number][] = [
      [520, 150],
      [900, 420],
      [200, 600],
      [1220, 200],
      [760, 920],
      [1420, 1000],
      [360, 1050],
    ];
    this.total = eggCoords.length;
    for (const [x, y] of eggCoords) {
      const egg = this.add.text(x, y, '🥚', { fontSize: '26px' });
      eggs.add(egg);
    }
    this.physics.add.overlap(this.player, eggs, (_player, egg) =>
      this.collect(egg as Phaser.GameObjects.Text),
    );

    // Camera follows the player across the world.
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // HUD + fact banner, pinned to the camera.
    this.hud = this.add
      .text(16, 16, '', { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(10);
    this.updateHud();

    this.banner = this.add
      .text(400, 560, '', {
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#065f46',
        padding: { x: 14, y: 8 },
        align: 'center',
        wordWrap: { width: 620 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setAlpha(0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  private collect(egg: Phaser.GameObjects.Text) {
    egg.destroy();
    this.collected += 1;
    this.updateHud();
    const fact = FACTS[Phaser.Math.Between(0, FACTS.length - 1)];
    this.showBanner(
      this.collected >= this.total ? `🎉 You found every egg! ${fact}` : `🥚 ${fact}`,
    );
  }

  private updateHud() {
    this.hud.setText(`🥚 Eggs: ${this.collected} / ${this.total}\nArrows / WASD to move`);
  }

  private showBanner(text: string) {
    this.banner.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 3500, duration: 600 });
  }

  override update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = 240;
    body.setVelocity(0);

    const left = this.cursors.left.isDown || this.wasd.A!.isDown;
    const right = this.cursors.right.isDown || this.wasd.D!.isDown;
    const up = this.cursors.up.isDown || this.wasd.W!.isDown;
    const down = this.cursors.down.isDown || this.wasd.S!.isDown;

    if (left) body.setVelocityX(-speed);
    else if (right) body.setVelocityX(speed);
    if (up) body.setVelocityY(-speed);
    else if (down) body.setVelocityY(speed);

    body.velocity.normalize().scale(speed);
  }
}

export function createDinoExplore(parent: HTMLDivElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 800,
    height: 600,
    backgroundColor: '#0f172a',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: ExploreScene,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  });
}

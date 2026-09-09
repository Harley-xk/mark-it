// 给应用图标加透明边距：把 logo 缩小居中到透明画布，再重新生成 .ico / .icns
// 用法: node scripts/pad-icon.cjs [scale]   scale 默认 0.8（logo 占画布比例，四周留 (1-scale)/2 边距）
//   例: node scripts/pad-icon.cjs 0.72   # 更松
//       node scripts/pad-icon.cjs 0.88   # 更紧
const sharp = require('sharp');
const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const SCALE = parseFloat(process.argv[2] || '0.8');
const SIZE = 552; // 画布尺寸（正方形）
const BUILD = path.join(__dirname, '..', 'build');
const SRC = path.join(BUILD, 'icon.png');        // 打包用的图标(加边后)
const FULL = path.join(BUILD, 'icon-full.png');  // 满铺原图(留底，调比例时从它重生成)

(async () => {
  // 首次运行：把当前 icon.png 当作满铺原图备份下来（之后调比例都从它生成）
  if (!fs.existsSync(FULL)) {
    fs.copyFileSync(SRC, FULL);
    console.log('✓ 已备份满铺原图 -> build/icon-full.png');
  }
  const inner = Math.round(SIZE * SCALE);

  // 1) 缩小 logo + 居中到透明画布
  const innerBuf = await sharp(FULL)
    .resize(inner, inner, { fit: 'fill', kernel: 'lanczos3' })
    .toBuffer();
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: innerBuf, gravity: 'center' }])
    .png()
    .toFile(SRC);
  console.log(`✓ build/icon.png  ${SIZE}x${SIZE}, logo=${inner}px (${Math.round(SCALE * 100)}%) 居中, 四周透明`);

  // 2) 重新生成 ico / icns
  const buf = fs.readFileSync(SRC);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), png2icons.createICO(buf, png2icons.BICUBIC, 0, false));
  fs.writeFileSync(path.join(BUILD, 'icon.icns'), png2icons.createICNS(buf, png2icons.BICUBIC, 0, false));
  console.log('✓ 已重新生成 build/icon.ico + build/icon.icns');

  // 3) 校验：四角应为透明 (alpha=0)
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const a = (x, y) => data[((y * info.width + x) * 4) + 3];
  console.log(
    `  四角 alpha: TL=${a(0, 0)} TR=${a(info.width - 1, 0)} BL=${a(0, info.height - 1)} BR=${a(info.width - 1, info.height - 1)} (0=透明 ✓)`
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

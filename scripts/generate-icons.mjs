import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const source = await readFile(new URL('../public/icon.svg', import.meta.url));
const outputDirectory = new URL('../public/icon/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const renderer = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
  });
  await writeFile(new URL(`${size}.png`, outputDirectory), renderer.render().asPng());
  console.log(`Generated ${size}×${size} icon`);
}

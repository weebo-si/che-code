/**********************************************************************
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as child_process from 'child_process';
import * as fs from './fs-extra.js';

// Loaded by workbench.html through /vscode-remote-resource
export const FONTS_CSS = '/checode/fonts.css';

const FONT_FILE = /\.(ttf|otf|woff2?)$/i;

// fontconfig weight -> CSS font-weight
const WEIGHTS: [number, number][] = [
  [0, 100],
  [40, 200],
  [50, 300],
  [80, 400],
  [100, 500],
  [180, 600],
  [200, 700],
  [205, 800],
  [210, 900],
];

/**
 * Declares the fonts of the dev container to the browser, so they can be used
 * in `editor.fontFamily` and `terminal.integrated.fontFamily`.
 */
export class Fonts {
  async configure(): Promise<void> {
    console.log('# Declaring the fonts of the container...');

    let fcList = '';
    try {
      fcList = child_process.execSync("fc-list -f '%{family[0]}|%{weight}|%{slant}|%{file}\\n'", {
        encoding: 'utf8',
        timeout: 5000,
      });
    } catch (err) {
      console.log(`  > fc-list failed, no container font declared: ${err}`);
    }

    const css = toCss(fcList);
    await fs.writeFile(FONTS_CSS, css);
    console.log(`  > ${css.split('@font-face').length - 1} fonts declared in ${FONTS_CSS}`);
  }
}

export function toCss(fcList: string): string {
  return fcList
    .split('\n')
    .map((line) => line.split('|'))
    .filter((fields) => fields.length >= 4 && FONT_FILE.test(fields[fields.length - 1]))
    .map((fields) => {
      const [family, weight, slant] = fields;
      const file = fields.slice(3).join('|');
      return `@font-face {
  font-family: "${family.replace(/[\\"]/g, '\\$&')}";
  src: url("vscode-remote-resource?path=${encodeURIComponent(file)}");
  font-weight: ${cssWeight(weight)};
  font-style: ${slant === '0' ? 'normal' : 'italic'};
  font-display: swap;
}
`;
    })
    .join('');
}

// A variable font gives a range, e.g. `[0 210]`
function cssWeight(weight: string): string {
  return (weight.match(/\d+/g) || ['80'])
    .map((w) => WEIGHTS.reduce((a, b) => (Math.abs(b[0] - +w) < Math.abs(a[0] - +w) ? b : a))[1])
    .join(' ');
}

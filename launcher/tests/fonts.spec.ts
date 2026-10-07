/**********************************************************************
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { execSync } from 'child_process';
import * as fs from '../src/fs-extra';

import { Fonts, toCss } from '../src/fonts';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(),
}));

const FC_LIST = [
  'FiraCode Nerd Font|80|0|/usr/local/share/fonts/FiraCodeNerdFont-Regular.ttf',
  'FiraCode Nerd Font|200|100|/usr/local/share/fonts/FiraCodeNerdFont-Bold Italic.ttf',
  'Recursive|[0 210]|0|/usr/share/fonts/Recursive.woff2',
  'Odd "Font"|90|110|/fonts/a|b.otf',
  'Fixed|80|0|/usr/share/fonts/misc/6x13.pcf.gz',
  'Noto Sans CJK|80|0|/usr/share/fonts/NotoSansCJK.ttc',
  '',
].join('\n');

const CSS = `@font-face {
  font-family: "FiraCode Nerd Font";
  src: url("vscode-remote-resource?path=%2Fusr%2Flocal%2Fshare%2Ffonts%2FFiraCodeNerdFont-Regular.ttf");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "FiraCode Nerd Font";
  src: url("vscode-remote-resource?path=%2Fusr%2Flocal%2Fshare%2Ffonts%2FFiraCodeNerdFont-Bold%20Italic.ttf");
  font-weight: 700;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Recursive";
  src: url("vscode-remote-resource?path=%2Fusr%2Fshare%2Ffonts%2FRecursive.woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Odd \\"Font\\"";
  src: url("vscode-remote-resource?path=%2Ffonts%2Fa%7Cb.otf");
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
`;

describe('Test declaring the container fonts:', () => {
  test('should convert the fc-list output to @font-face rules', () => {
    expect(toCss(FC_LIST)).toBe(CSS);
  });

  test('should write the fonts to /checode/fonts.css', async () => {
    const writeFileMock = jest.fn();
    Object.assign(fs, { writeFile: writeFileMock });
    (execSync as jest.Mock).mockReturnValue(FC_LIST);

    await new Fonts().configure();

    expect(writeFileMock).toBeCalledWith('/checode/fonts.css', CSS);
  });

  test('should write an empty file when fc-list is missing', async () => {
    const writeFileMock = jest.fn();
    Object.assign(fs, { writeFile: writeFileMock });
    (execSync as jest.Mock).mockImplementation(() => {
      throw new Error('fc-list: command not found');
    });

    await new Fonts().configure();

    expect(writeFileMock).toBeCalledWith('/checode/fonts.css', '');
  });
});

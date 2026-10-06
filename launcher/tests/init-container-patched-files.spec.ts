/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from 'fs';
import * as path from 'path';
import * as files from '../src/files';

describe('Test entrypoint-init-container.sh', () => {
  test('should restore every file the launcher patches in place', () => {
    const script = fs.readFileSync(
      path.join(__dirname, '..', '..', 'build', 'scripts', 'entrypoint-init-container.sh'),
      'utf8'
    );
    const patchedFiles = script.match(/PATCHED_FILES="([^"]*)"/)?.[1].split('\n');

    expect(patchedFiles).toEqual(expect.arrayContaining(['product.json', ...Object.values(files)]));
  });
});

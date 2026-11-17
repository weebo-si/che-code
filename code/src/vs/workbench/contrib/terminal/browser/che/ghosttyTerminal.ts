/**********************************************************************
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import type { ITerminalAddon, ITerminalInitOnlyOptions, ITerminalOptions, Terminal as RawXtermTerminal } from '@xterm/xterm';
import { resolveAmdNodeModulePath } from '../../../../../amdX.js';
import { Emitter } from '../../../../../base/common/event.js';

/**
 * Experimental terminal engine based on ghostty-web (`terminal.integrated.experimental.engine`).
 *
 * ghostty-web implements only a part of the xterm.js API. This adapter fills the gaps so the
 * rest of the terminal code runs unchanged, with fewer features: no shell integration in the
 * browser, no decorations, no markers, no find, no GPU renderer, no screen reader support.
 *
 * ponytail: the members that ghostty-web lacks are neutralized, not implemented. Anything not
 * listed in `overrides` falls into a black hole and is logged once in the console. Implement
 * them in ghostty-web itself if this engine is kept.
 */

type GhosttyWeb = typeof import('ghostty-web');

let ghosttyConstructor: Promise<typeof RawXtermTerminal> | undefined;

export function getGhosttyConstructor(): Promise<typeof RawXtermTerminal> {
	ghosttyConstructor ??= (async () => {
		const lib: GhosttyWeb = await import(resolveAmdNodeModulePath('ghostty-web', 'dist/ghostty-web.js'));
		// The library can also load its WASM from an embedded data: URI, which the workbench
		// CSP refuses (connect-src). Load the file served next to it instead.
		const ghostty = await lib.Ghostty.load(resolveAmdNodeModulePath('ghostty-web', 'ghostty-vt.wasm'));
		return function (options?: ITerminalOptions & ITerminalInitOnlyOptions) {
			return createTerminal(lib, ghostty, options ?? {});
		} as unknown as typeof RawXtermTerminal;
	})();
	return ghosttyConstructor;
}

const noDisposable = () => ({ dispose() { } });

/** Stands for any xterm.js member that ghostty-web does not have: can be read, called and disposed. */
function createBlackHole(): unknown {
	const hole: unknown = new Proxy(function () { }, {
		get: (_target, prop) => prop === Symbol.toPrimitive ? () => 0 : prop === 'then' ? undefined : hole,
		set: () => true,
		apply: () => hole,
	});
	return hole;
}

function createTerminal(lib: GhosttyWeb, ghostty: InstanceType<GhosttyWeb['Ghostty']>, options: ITerminalOptions & ITerminalInitOnlyOptions): RawXtermTerminal {
	const term = new lib.Terminal({
		ghostty,
		cols: options.cols,
		rows: options.rows,
		cursorBlink: options.cursorBlink,
		cursorStyle: options.cursorStyle,
		theme: options.theme,
		// ponytail: ghostty-web reads the scrollback limit as bytes, not lines (coder/ghostty-web#140).
		// 2000 bytes per line is a rough guess, drop it when the issue is fixed.
		scrollback: Math.min((options.scrollback ?? 1000) * 2000, 0x7fffffff),
		fontSize: options.fontSize,
		fontFamily: options.fontFamily,
	});

	// ghostty-web refuses every write until the terminal is open, while VS Code writes to
	// terminals that were never shown. Open it now in a detached element with the DOM structure
	// that VS Code expects from xterm.js. open() attaches it later.
	const doc: Document = options.documentOverride ?? document;
	const element = doc.createElement('div');
	element.className = 'xterm';
	const screen = doc.createElement('div');
	screen.className = 'xterm-screen';
	element.appendChild(screen);
	term.open(screen);
	const canvas = screen.querySelector('canvas');
	if (canvas) {
		// xterm.css positions the canvases of .xterm-screen as absolute layers
		canvas.style.position = 'relative';
	}

	const onWriteParsed = new Emitter<void>();
	const hole = createBlackHole();
	const warned = new Set<string | symbol>();
	const missing = (owner: string, prop: string | symbol): unknown => {
		if (prop === 'then' || typeof prop === 'symbol') {
			return undefined;
		}
		if (!warned.has(`${owner}.${prop}`)) {
			warned.add(`${owner}.${prop}`);
			console.warn(`[ghostty] xterm.js API not available: ${owner}.${prop}`);
		}
		return hole;
	};

	// The private xterm.js API that VS Code reads. Only the cell size is real: it is what
	// VS Code uses to compute the number of columns and rows.
	const core = new Proxy<Record<string | symbol, unknown>>({
		viewport: undefined,
		_renderService: {
			_renderer: { get value() { return overrides.element ? term.renderer : undefined; } },
			dimensions: {
				css: {
					cell: {
						get width() { return term.renderer?.getMetrics().width ?? 0; },
						get height() { return term.renderer?.getMetrics().height ?? 0; },
					}
				}
			},
		},
	}, {
		get: (target, prop) => prop in target ? target[prop] : missing('_core', prop),
	});

	const overrides: Record<string | symbol, unknown> = {
		_core: core,
		element: undefined,
		open(parent: HTMLElement): void {
			// VS Code calls open(element) again when the terminal moves to another window
			if (parent === element) {
				return;
			}
			parent.appendChild(element);
			overrides.element = element;
			// The fonts may not have been available while the element was detached
			term.renderer?.remeasureFont();
			term.renderer?.resize(term.cols, term.rows);
		},
		write(data: string | Uint8Array, callback?: () => void): void {
			term.write(data, () => {
				onWriteParsed.fire();
				callback?.();
			});
		},
		writeln(data: string | Uint8Array, callback?: () => void): void {
			term.writeln(data, () => {
				onWriteParsed.fire();
				callback?.();
			});
		},
		loadAddon(addon: ITerminalAddon): void {
			// The xterm.js addons (webgl, search, unicode11...) need the xterm.js internals
			try {
				addon.activate(proxy);
			} catch (e) {
				console.warn('[ghostty] addon not supported', e);
			}
		},
		// xterm.js: return false to stop the event. ghostty-web: return true (coder/ghostty-web#192).
		attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
			term.attachCustomKeyEventHandler(event => !handler(event));
		},
		attachCustomWheelEventHandler(handler: (event: WheelEvent) => boolean): void {
			term.attachCustomWheelEventHandler(event => !handler(event));
		},
		// The link providers of VS Code rely on markers and on the xterm.js internals. ghostty-web
		// keeps its own detection of URLs and OSC 8 links.
		registerLinkProvider: noDisposable,
		registerMarker: () => undefined,
		registerDecoration: () => undefined,
		registerCharacterJoiner: () => -1,
		deregisterCharacterJoiner(): void { },
		markers: [],
		parser: {
			registerApcHandler: noDisposable,
			registerCsiHandler: noDisposable,
			registerDcsHandler: noDisposable,
			registerEscHandler: noDisposable,
			registerOscHandler: noDisposable,
		},
		// ghostty-web exposes a read-only version, VS Code assigns it
		unicode: { activeVersion: '15', versions: ['15'], register(): void { } },
		modes: {
			get bracketedPasteMode() { return term.hasBracketedPaste(); },
			get sendFocusMode() { return term.hasFocusEvents(); },
			get mouseTrackingMode() { return term.hasMouseTracking() ? 'any' : 'none'; },
		},
		onWriteParsed: onWriteParsed.event,
		onLineFeed: noDisposable,
		onBinary: noDisposable,
		clearTextureAtlas(): void { },
		refresh(): void { },
		dispose(): void {
			onWriteParsed.dispose();
			term.dispose();
			element.remove();
		},
	};

	const proxy = new Proxy(term, {
		get(target, prop) {
			if (prop in overrides) {
				return overrides[prop];
			}
			const value = Reflect.get(target, prop, target);
			if (typeof value === 'function') {
				return value.bind(target);
			}
			if (value === undefined && !(prop in target)) {
				return missing('terminal', prop);
			}
			return value;
		},
		set(target, prop, value) {
			if (prop in overrides) {
				overrides[prop] = value;
			} else {
				Reflect.set(target, prop, value, target);
			}
			return true;
		},
		has: (target, prop) => prop in overrides || prop in target,
	}) as unknown as RawXtermTerminal;

	return proxy;
}

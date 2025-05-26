import { writable } from 'svelte/store';

type GaragaType = typeof import('garaga');
type NoirWasmType = typeof import('@noir-lang/noir_wasm');
type BbType = typeof import('@aztec/bb.js');
type NoirJsType = typeof import('@noir-lang/noir_js');

export interface ZkLibraries {
	status: 'idle' | 'loading' | 'ready' | 'error';
	garaga: GaragaType | null;
	noirWasm: NoirWasmType | null;
	noirJs: NoirJsType | null;
	bb: BbType | null;
	error?: string;
}

/**
 * A writable store holding ZK library modules and load status.
 */
export const zkLibraries = writable<ZkLibraries>({
	status: 'idle',
	garaga: null,
	noirWasm: null,
	noirJs: null,
	bb: null,
	error: undefined
});

/**
 * Dynamically imports and initializes all ZK libraries, updating `zkLibraries`.
 */
export async function initZkLibraries() {
	// mark loading
	zkLibraries.update((s) => ({ ...s, status: 'loading', error: undefined }));

	try {
		// load modules in parallel
		const [garagaModule, noirModule, acvmJs, noircAbi, noirJsModule, bbModule] = await Promise.all([
			import('garaga'),
			import('@noir-lang/noir_wasm'),
			import('@noir-lang/acvm_js'),
			import('@noir-lang/noirc_abi'),
			import('@noir-lang/noir_js'),
			import('@aztec/bb.js')
		]);

		// initialize Garaga
		await garagaModule.init();
		// initialize ACVM & Noirc ABI
		const initACVM = acvmJs.default;
		const initNoirC = noircAbi.default;
		const [acvmUrl, noirUrl] = await Promise.all([
			import('@noir-lang/acvm_js/web/acvm_js_bg.wasm?url'),
			import('@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url')
		]);

		await Promise.all([
			initACVM({ module_or_path: acvmUrl.default }),
			initNoirC({ module_or_path: noirUrl.default })
		]);

		zkLibraries.set({
			status: 'ready',
			garaga: garagaModule,
			noirWasm: noirModule,
			noirJs: noirJsModule,
			bb: bbModule
		});
	} catch (err: unknown) {
		console.error('Failed to initialize ZK libraries:', err);

		const message =
			err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';

		zkLibraries.set({
			status: 'error',
			garaga: null,
			noirWasm: null,
			noirJs: null,
			bb: null,
			error: message
		});
	}
}

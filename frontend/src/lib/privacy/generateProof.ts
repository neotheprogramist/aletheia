import { get } from 'svelte/store';
import { zkLibraries } from '$lib/stores/zkLibraries';
import { deflattenFields, RawBuffer, UltraHonkBackend } from '@aztec/bb.js';
import type { CompiledCircuit, InputMap } from '@noir-lang/noir_js';
import { flattenFieldsAsArray } from '$lib/utils/flattenFields';
import { toastStore } from '$lib/stores/toast';

export async function generateHonkCalldata(
	circuitPath: string,
	recursivePath: string,
	vkRecursiveBin: string,
	primaryInput: InputMap
) {
	toastStore.addToast({
		type: 'info',
		message: '🪄 Brewing zk proof potion… hang tight!'
	});

	// 1) Check zklibs
	const zkLibs = get(zkLibraries);
	if (!zkLibs.noirJs || !zkLibs.bb || !zkLibs.garaga) {
		throw new Error('ZK libraries not initialized');
	}

	// 2) Fetch inner circuit
	const program = await fetch(circuitPath).then((r) => r.json());
	const primaryCircuit = new zkLibs.noirJs.Noir(program as CompiledCircuit);
	const primaryBackend = new zkLibs.bb.UltraHonkBackend(
		program.bytecode,
		{ threads: 2 },
		{ recursive: true }
	);

	// 3) Inner witness and proof
	const { witness: primaryWitness } = await primaryCircuit.execute(primaryInput);
	const { proof: primaryProofFields, publicInputs: primaryPublicInputs } =
		await primaryBackend.generateProof(primaryWitness);

	// 4) Get and format inner vk
	const innerVk = await primaryBackend.getVerificationKey();
	const barretenbergAPI = await zkLibs.bb.Barretenberg.new({ threads: 1 });
	const vkAsFields: string[] = (
		await barretenbergAPI.acirVkAsFieldsUltraHonk(new RawBuffer(innerVk))
	).map((field) => field.toString());

	// 5) Load recursive circuit and vk
	const programRecursive = await fetch(recursivePath).then((r) => r.json());
	const vkBinRecursiveBuffer = new Uint8Array(await (await fetch(vkRecursiveBin)).arrayBuffer());
	const recursiveCircuit = new zkLibs.noirJs.Noir(programRecursive as CompiledCircuit);
	const recursiveBackend = new UltraHonkBackend(
		programRecursive.bytecode,
		{ threads: 2 },
		{ recursive: true }
	);

	// 6) Prepare input for recursive witness generation
	const recursiveInputs = {
		proof: deflattenFields(primaryProofFields),
		public_inputs: primaryPublicInputs,
		verification_key: vkAsFields
	};
	const { witness: recursiveWitness } = await recursiveCircuit.execute(recursiveInputs);
	const { proof: recursiveProof, publicInputs: recursivePublicInputs } =
		await recursiveBackend.generateProof(recursiveWitness, { keccak: true });

	// 7) generate honkCalldata
	const honkCalldata = zkLibs.garaga.getHonkCallData(
		recursiveProof,
		flattenFieldsAsArray(recursivePublicInputs),
		vkBinRecursiveBuffer,
		0
	);

	// 8) Convert Uint8Array to hex
	return honkCalldata.map((element) => `0x${element.toString(16)}`);
}

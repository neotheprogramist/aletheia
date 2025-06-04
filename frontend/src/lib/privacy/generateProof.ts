import { zkLibraries } from '$lib/stores/zkLibraries';
import { RawBuffer, type ProofData } from '@aztec/bb.js';
import type { InputMap } from '@noir-lang/noirc_abi';
import { get } from 'svelte/store';

interface CircuitData {
	jsonUrl: string;
	vkUrl: string;
}

interface GenerateProofResponse {
	honkCalldataHex: string[];
	rawProof: ProofData;
	vkAsFields: string[];
}

export async function generateProof(
	witnessInput: InputMap,
	circuitData: CircuitData,
	recursive = false
) {
	// 1) Circuit artifacts from static
	const program = await fetch(circuitData.jsonUrl).then((r) => r.json());
	const vkBin = await fetch(circuitData.vkUrl).then((r) => r.arrayBuffer());
	const zkLibs = get(zkLibraries);
	if (!zkLibs.noirJs || !zkLibs.bb || !zkLibs.garaga)
		throw new Error('ZK libraries not initialized');
	const noir = new zkLibs.noirJs.Noir(program);
	const { witness } = await noir.execute(witnessInput);
	const backend = new zkLibs.bb.UltraHonkBackend(program.bytecode, { threads: 2 }, { recursive });
	const verificationKey = await backend.getVerificationKey();
	const barretenbergAPI = await zkLibs.bb.Barretenberg.new({ threads: 1 });
	const vkAsFields = (
		await barretenbergAPI.acirVkAsFieldsUltraHonk(new RawBuffer(verificationKey))
	).map((field) => field.toString());
	const proofData = await backend.generateProof(witness, { keccak: true });

	if (!proofData) throw new Error('NO PROOF DATA');
	console.debug('-->  generate proof finished');

	const honkCalldata = zkLibs.garaga.getHonkCallData(
		proofData.proof,
		flattenFieldsAsArray(proofData.publicInputs),
		new Uint8Array(vkBin),
		0
	);
	console.debug('-->  honkCalldata finished');

	const honkCalldataHex = [...honkCalldata.map((element) => `0x${element.toString(16)}`)];

	return {
		honkCalldataHex,
		rawProof: proofData,
		vkAsFields
	} satisfies GenerateProofResponse;
}

function flattenFieldsAsArray(fields: string[]) {
	const flattenedPublicInputs = fields.map(hexToUint8Array);
	return flattenUint8Arrays(flattenedPublicInputs);
}

function flattenUint8Arrays(arrays: Uint8Array<ArrayBuffer>[]) {
	const totalLength = arrays.reduce((acc: number, val: Uint8Array) => acc + val.length, 0);
	const result = new Uint8Array(totalLength);

	let offset = 0;
	for (const arr of arrays) {
		result.set(arr, offset);
		offset += arr.length;
	}

	return result;
}

function hexToUint8Array(hex: string) {
	const sanitisedHex = BigInt(hex).toString(16).padStart(64, '0');

	const len = sanitisedHex.length / 2;
	const u8 = new Uint8Array(len);

	let i = 0;
	let j = 0;
	while (i < len) {
		u8[i] = parseInt(sanitisedHex.slice(j, j + 2), 16);
		i += 1;
		j += 2;
	}

	return u8;
}

import { get } from 'svelte/store';
import { zkLibraries } from '$lib/stores/zkLibraries';

interface ProofData {
	index: number;
	path: (bigint[] | boolean[])[];
	root: bigint;
}

export class HybridMerkleTree {
	private readonly poseidon: (a: bigint, b: bigint) => bigint;

	readonly height: number;
	readonly precomputed: bigint[];
	readonly leftPath: bigint[];
	readonly layers: bigint[][];
	readonly leafs: bigint[];
	private freeIndex: number;

	constructor(height: number, leafs?: bigint[]) {
		const { garaga } = get(zkLibraries);
		if (!garaga) throw new Error('❌ Garaga not initialized');
		this.poseidon = (a: bigint, b: bigint) => garaga.poseidonHashBN254(a, b);

		this.height = height;
		this.precomputed = HybridMerkleTree.computePrecomputedHashes(height, this.poseidon);
		this.leftPath = [...this.precomputed];
		this.layers = Array.from({ length: height }, () => []);
		this.leafs = [];
		this.freeIndex = 0;

		if (leafs) {
			for (const leaf of leafs) {
				this.addLeaf(leaf);
			}
		}
	}

	addLeaf(leaf: bigint) {
		if (this.leafs.includes(leaf)) return;

		let hashVal = leaf;
		let index = this.freeIndex++;
		this.leafs.push(leaf);
		this.layers[0].push(leaf);

		for (let i = 1; i < this.height; i++) {
			if (index % 2 === 0) {
				const combined = this.poseidon(hashVal, this.precomputed[i - 1]);
				this.leftPath[i - 1] = hashVal;
				hashVal = combined;
			} else {
				hashVal = this.poseidon(this.leftPath[i - 1], hashVal);
			}
			index = Math.floor(index / 2);
			if (this.layers[i][index] !== undefined) {
				this.layers[i][index] = hashVal;
			} else {
				this.layers[i].push(hashVal);
			}
		}
		this.leftPath[this.height - 1] = hashVal;
	}

	getRoot() {
		return this.leftPath[this.height - 1];
	}

	path(index: number) {
		if (index >= this.layers[0].length) throw new Error('Leaf does not exist!');
		const elements: bigint[] = [];
		const indices: boolean[] = [];

		for (let i = 0; i < this.height - 1; i++) {
			const isRight = index % 2 === 1;
			let sibling: bigint;
			if (isRight) {
				sibling = this.layers[i][index - 1];
			} else {
				sibling = this.layers[i][index + 1] ?? this.precomputed[i];
			}
			elements.push(sibling);
			indices.push(isRight);
			index = Math.floor(index / 2);
		}
		return [elements, indices];
	}

	findLeafIndex(leaf: bigint) {
		const index = this.layers[0].findIndex((x) => x === leaf);
		return index >= 0 ? index : null;
	}

	static computePrecomputedHashes(height: number, hashFn: (a: bigint, b: bigint) => bigint) {
		const hashes: bigint[] = [];
		let current = hashFn(0n, 0n);
		hashes.push(current);
		for (let i = 1; i < height; i++) {
			current = hashFn(current, current);
			hashes.push(current);
		}

		return hashes;
	}

	getLeafs() {
		return this.leafs;
	}

	getLayer0() {
		return this.layers[0];
	}

	getProofData(leaf: bigint) {
		const leafIndex = this.findLeafIndex(leaf);
		if (!leafIndex) {
			throw new Error('Leaf index not found');
		}

		const path = this.path(leafIndex);
		const root = this.getRoot();

		return {
			index: leafIndex,
			path,
			root
		} satisfies ProofData;
	}
}

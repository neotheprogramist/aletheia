import { describe, it, expect, beforeAll } from 'vitest';
import { HybridMerkleTree } from './hybridMerkleTree';
import { zkLibraries } from '$lib/stores/zkLibraries';
import * as garaga from 'garaga';

beforeAll(async () => {
	await garaga.init();
	zkLibraries.set({
		status: 'ready',
		garaga,
		noirWasm: null
	});
});

function computeMerkleRootJs(
	leaf: bigint,
	index: number,
	hashPath: bigint[],
	hashFn: (a: bigint, b: bigint) => bigint
): bigint {
	let current = leaf;
	for (const sibling of hashPath) {
		current = index % 2 === 1 ? hashFn(sibling, current) : hashFn(current, sibling);
		index = Math.floor(index / 2);
	}
	return current;
}

describe('HybridMerkleTree with Garaga Poseidon', () => {
	it('should compute non-null root after adding leafs', () => {
		const tree = new HybridMerkleTree(3);
		tree.addLeaf(1n);
		tree.addLeaf(2n);
		tree.addLeaf(3n);
		tree.addLeaf(4n);

		const root = tree.getRoot();
		const rootStr = `0x${root.toString(16)}`;
		expect(root).not.toBe(tree['precomputed'][2]);
		expect(rootStr).toBe('0x75d30e28d48842bd6c1044b68f982d586e2892ae91c77f8f56111d8f55070ed');
	});

	it('should preserve root from computed path', () => {
		const tree = new HybridMerkleTree(3);
		const leaf = 1n;
		tree.addLeaf(leaf);
		tree.addLeaf(2n);
		tree.addLeaf(3n);
		tree.addLeaf(4n);

		const index = tree.findLeafIndex(leaf)!;
		const [siblings] = tree.path(index) as [bigint[], boolean[]];
		const recomputed = computeMerkleRootJs(leaf, index, siblings, garaga.poseidonHashBN254);

		expect(recomputed).toBe(tree.getRoot());
	});

	it('should support high-depth trees', () => {
		const height = 32;
		const tree = new HybridMerkleTree(height);
		for (let i = 1n; i <= 100n; i++) {
			tree.addLeaf(i);
		}

		expect(tree.getLeafs().length).toBe(100);
		expect(tree.getLayer0().length).toBe(100);
		expect(tree.getRoot()).not.toBe(tree['precomputed'][height - 1]);
	});

	it('should return correct path or throw if not found', () => {
		const tree = new HybridMerkleTree(3);
		tree.addLeaf(123n);

		expect(() => tree.path(1)).toThrow('Leaf does not exist!');
	});

	it('should find correct index of leaf', () => {
		const tree = new HybridMerkleTree(3);
		tree.addLeaf(42n);
		expect(tree.findLeafIndex(42n)).toBe(0);
		expect(tree.findLeafIndex(99n)).toBe(null);
	});

	it('should give different proofs for different leaves', () => {
		const tree = new HybridMerkleTree(3);
		tree.addLeaf(1n);
		tree.addLeaf(2n);

		const [p0, b0] = tree.path(0);
		const [p1, b1] = tree.path(1);

		expect(p0).not.toEqual(p1);
		expect(b0).not.toEqual(b1);
	});
});

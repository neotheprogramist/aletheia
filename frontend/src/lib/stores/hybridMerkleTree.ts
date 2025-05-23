import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { HybridMerkleTree } from '$lib/merkle/hybridMerkleTree';

export const merkleTreeStore: Writable<HybridMerkleTree | null> = writable(null);

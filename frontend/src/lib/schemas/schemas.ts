import { z } from 'zod';

export const NoteDataSchema = z.object({
	tokenAddress: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Must be hex address'),
	amount: z
		.union([z.string(), z.bigint()])
		.transform((amt) => amt.toString())
		.refine((amt) => !isNaN(Number(amt)), 'Must be numeric string')
});

export type NoteData = z.infer<typeof NoteDataSchema>;

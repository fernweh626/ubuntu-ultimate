import { createHash } from 'node:crypto';
export const randomUUID = () => crypto.randomUUID();
export const CryptoDigestAlgorithm = { MD5: 'md5' } as const;
export const digestStringAsync = async (alg: string, s: string) => createHash(alg).update(s, 'utf8').digest('hex');

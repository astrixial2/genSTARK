// IMPORTS
// ================================================================================================
import { StarkProof, BatchMerkleProof } from '@guildofweavers/genstark';

// MODULE VARIABLES
// ================================================================================================
export const MAX_ARRAY_LENGTH = 256;
export const MAX_MATRIX_COLUMN_LENGTH = 127;

// PUBLIC FUNCTIONS
// ================================================================================================
export function sizeOf(proof: StarkProof, hashDigestSize: number) {

    let size = 0;
    
    // evData
    let evData = 1; // length of values array
    for (let value of proof.values) {
        evData += value.byteLength;
    }
    size += evData;

    // evProof
    let evProof = hashDigestSize; // root
    evProof += sizeOfMatrix(proof.evProof.nodes);
    evProof += 1; // evaluation proof depth
    size += evProof;

    // lcProof
    let lcProof = hashDigestSize; // root;
    lcProof += sizeOfMatrix(proof.lcProof.nodes);
    lcProof += 1; // linear combination proof depth
    size += lcProof;

    // ldProof
    let ldProof = 1; // ld component count
    const ldLevels: number[] = [];
    for (let i = 0; i < proof.ldProof.components.length; i++) {
        let component = proof.ldProof.components[i];
        let ldLevel = hashDigestSize; // column root
        ldLevel += sizeOfMerkleProof(component.columnProof);
        ldLevel += sizeOfMerkleProof(component.polyProof);
        ldProof += ldLevel;
        ldLevels.push(ldLevel);
    }
    let ldRemainder = sizeOfArray(proof.ldProof.remainder);
    ldLevels.push(ldRemainder);
    ldProof += ldRemainder;
    size += ldProof;

    return { evData, evProof, lcProof, ldProof: { levels: ldLevels, total: ldProof }, total: size };
}

export function sizeOfMerkleProof(proof: BatchMerkleProof) {
    let size = 0;
    size += sizeOfArray(proof.values);
    size += sizeOfMatrix(proof.nodes);
    size += 1; // tree depth
    return size;
}

// HELPER FUNCTIONS
// ================================================================================================
function sizeOfArray(array: any[]): number {
    if (array.length === 0) {
        throw new Error(`Array cannot be zero-length`);
    }
    else if (array.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Array length (${array.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1; // 1 byte for array length
    for (let i = 0; i < array.length; i++) {
        size += array[i].length;
    }
    return size;
}

function sizeOfMatrix(matrix: any[][]): number {

    if (matrix.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Matrix column count (${matrix.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1;           // 1 byte for number of columns
    size += matrix.length;  // 1 byte for length and type of each column

    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        let columnLength = column.length;
        if (columnLength >= MAX_MATRIX_COLUMN_LENGTH) {
            throw new Error(`Matrix column length (${columnLength}) cannot exceed ${MAX_MATRIX_COLUMN_LENGTH}`);
        }

        for (let j = 0; j < columnLength; j++) {
            size += column[j].length;
        }
    }

    return size;
}
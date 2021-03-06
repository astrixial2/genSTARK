# Rescue STARKs

Examples in this directory use a modified version of [Rescue hash function](https://eprint.iacr.org/2019/426.pdf) to define various STARKs. As compared to the original construct, the modifications are as follows:

* The second step of the last round is omitted from the computation;
* The first step of the first round is pre-computed;
* The function is restricted to accepting a single value..

 All constants used in computations were generated by using code from here: https://github.com/KULeuven-COSIC/Marvellous.

## Hash preimage
THere are two examples that generate STARKs to prove knowledge of hash preimage. Both are essentially the same, but use different parameters for Rescue hash function:

### Hash 2x64

In this example, the following parameters are uses:
 * p (field modulus): 2^64 - 21 * 2^30 + 1
 * m (number of registers): 2
 * N (rounds): 32

 ### Hash 4x128

In this example, the following parameters are uses:
 * p (field modulus): 2^128 - 9 * 2^32 + 1
 * m (number of registers): 4
 * N (rounds): 32

 ## Merkle Proof
 This example generates STARKs for computations that verify Merkle proofs. Basically, it can be used to prove that you know a proof for some value in a Merkle tree at the specified index without revealing that value or the proof.

 Just as a reminder the code (in JavaScript) for verifying Merkle proof looks like this:
 ```JavaScript
 function verify(root, index, proof) {
     index += 2**proof.length;

    let v = proof[0];
    for (let i = 1; i < proof.length; i++) {
        p = proof[i];
        if (index & 1) {
            v = hash(p, v);
        }
        else {
            v = hash(v, p);
        }
        index = index >> 1;
    }

    return root === v;
 }
 ```
The way this is translated into a STARK is:

* There are 8 state registers:
  * The first 4 registers (`$r0` - `$r3`) are used to compute `hash(p, v)`.
  * The other 4 registers (`$r4` - `$r7`) are used to compute `hash(v, p)`.
* Each register is 128-bits, and values in the merkle tree are assumed to be 128-bits as well. For example, `hash(p, v)` works like so:
  * Value `p` goes into registers `$r0`. Value `v` goes into registers `$r1`. The other 2 registers (`$r2` and `$r3`) are used internally by the hash function algorithm and are initialized to `0`.
  * After 31 steps, the hash of two values is in registers `$r0`.
* There is also a single auxiliary input register `$p0` which holds a binary representation of the `index` value. The value in this register is used to figure out whither `hash(p, v)` or `hash(v, p)` advances to the next cycle.
* Since, hashing takes 31 steps, the computation consists of a 32-step loop repeated for each node of a Merkle branch. The code works as follows:
  * The value of the node at `index` is passed in via register `$i0`. All other nodes in the merkle branch are passed in via register `$i1`. So, there are many values in register `$i1` for each value in register `$i0`.
  * The first `init` clause is executed once for each branch (you can generate proofs for multiple branches). All it does is initialize `$r` registers to hold values passed in via `$i` registers (see [this](https://github.com/GuildOfWeavers/AirScript#nested-input-loops) for more explanation of how input loops work).
  * The second `init` clause is executed once for each node in a branch. It uses value in `$p0` to figure out which of the hashed values (`hash(p, v)` or `hash(v, p)`) advances to the next cycle of hashing.
  * The `for steps` loop executes the actual hash function logic. It computes both, `hash(p, v)` and `hash(v, p)` at the same, with result of `hash(p, v)` going to register `$r0` and result of `hash(v, p)` going to register `$r4`.

This all results into a transition function that looks like this:
```
transition 8 registers {
    for each ($i0, $i1) {

        // initialize state with first 2 node values
        init [$i0, $i1, 0, 0, $i1, $i0, 0, 0];

        for each ($i1) {

            // for each node, figure out which value advances to the next cycle
            init {
                h <- $p0 ? $r4 : $r0;
                [h, $i1, 0, 0, $i1, h, 0, 0];
            }

            // execute Rescue hash function computation for 31 steps
            for steps [1..31] {
                // compute hash(p, v)
                S1 <- MDS # $r[0..3]^alpha + $k[0..3];
                S1 <- MDS # (/S1)^(inv_alpha) + $k[4..7];

                // compute hash(v, p)
                S2 <- MDS # $r[4..7]^alpha + $k[0..3];
                S2 <- MDS # (/S2)^(inv_alpha) + $k[4..7];

                [...S1, ...S2];
            }
        }
    }
}
```
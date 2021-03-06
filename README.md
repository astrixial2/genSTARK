# genSTARK
This library is intended to help you quickly and easily generate STARK-based proofs of computation using JavaScript. The goal is to take care of as much boilerplate code as possible, and let you focus on the specifics of your computations.

### Background
A STARK is a novel proof-of-computation scheme that allows you to create an efficiently verifiable proof that a computation was executed correctly. The scheme was developed by Eli-Ben Sasson and team at Technion-Israel Institute of Technology. STARKs do not require an initial trusted setup, and rely on very few cryptographic assumptions. See [references](#References) for more info.

### Disclaimer
**DO NOT USE THIS LIBRARY IN PRODUCTION.** At this point, this is a research-grade library. It has known and unknown bugs and security flaws.

# Install
```Bash
$ npm install @guildofweavers/genstark --save
```

# Usage
Here is a trivial example of how to use this library. In this example, the computation is just adding 2 to the current value at each step. That is: x<sub>n+1</sub> = x<sub>n</sub> + 2.

```TypeScript
import { Stark } from '@guildofweavers/genstark';

// define a STARK for this computation
const fooStark = new Stark(`
define Foo over prime field (2^32 - 3 * 2^25 + 1) {

    // define transition function
    transition 1 register {
        for each ($i0) {
            init { $i0 }
            for steps [1..63] { $r0 + 2 }
        }
    }

    // define transition constraints
    enforce 1 constraint {
        for all steps { transition($r) = $n }
    }
}`);

// create a proof that if we start computation at 1, we end up at 127 after 64 steps
const assertions = [
    { register: 0, step: 0,  value: 1n   },  // value at first step is 1
    { register: 0, step: 63, value: 127n }   // value at last step is 127
];
const proof = fooStark.prove(assertions, [[1n]]);

// verify that if we start at 1 and run the computation for 64 steps, we get 127
const result = fooStark.verify(assertions, proof);
console.log(result); // true
```

There are a few more sophisticated examples in this repository:
* [Demo STARKs](/examples/demo) - demonstration of how to use various features of this library.
* [MiMC STARK](/examples/mimc) - basically the same as Vitalik Buterin's [MiMC tutorial](https://vitalik.ca/general/2018/07/21/starks_part_3.html).
* [Rescue STARKs](/examples/rescue) - various STARKs based on [Rescue](https://eprint.iacr.org/2019/426.pdf) hash function (e.g. proof of hash preimage, Merkle proof).
* [Poseidon STARKs](/examples/poseidon) - various STARKs based on [Poseidon](https://eprint.iacr.org/2019/458.pdf) hash function (e.g. proof of hash preimage, Merkle proof).

When you run the examples, you should get a nice log documenting each step. Here is an example output of running 128-bit MiMC STARK for 2<sup>13</sup> steps:
```
Starting STARK computation
Set up evaluation context in 146 ms
Generated execution trace in 52 ms
Computed execution trace polynomials P(x) in 7 ms
Low-degree extended P(x) polynomials over evaluation domain in 83 ms
Serialized evaluations of P(x) and S(x) polynomials in 92 ms
Built evaluation merkle tree in 87 ms
Computed composition polynomial C(x) in 574 ms
Combined P(x) and S(x) evaluations with C(x) evaluations in 50 ms
Computed low-degree proof in 231 ms
Computed 48 evaluation spot checks in 2 ms
STARK computed in 1327 ms
--------------------
Proof serialized in 8 ms; size: 94.58 KB
--------------------
Proof parsed in 6 ms
--------------------
Starting STARK verification
Set up evaluation context in 9 ms
Computed positions for evaluation spot checks in 1 ms
Decoded evaluation spot checks in 1 ms
Verified evaluation merkle proof in 4 ms
Verified transition and boundary constraints in 52 ms
Verified low-degree proof in 14 ms
STARK verified in 85 ms
--------------------
STARK security level: 96
```

# API

You can find complete API definitions in [genstark.d.ts](/genstark.d.ts). Here is a quick overview of the provided functionality:

## Defining a STARK

To create a STARK for a computation you need to create a `Stark` object like so:
```TypeScript
const myStark = new Stark(source, security, optimization, logger);
```

The meaning of the constructor parameters is as follows:

| Parameter          | Description |
| ------------------ | ----------- |
| source             | [AirScript](https://github.com/GuildOfWeavers/AirScript) source defining transition function, transition constraints, and other properties of the STARK. |
| security?          | An optional property specifying [security parameters](#Security-options) for the STARK. |
| optimization?      | An optional property specifying [WASM optimization parameters](#Optimization-options) for the STARK. You can also set this to `true` to turn on WASM optimization with default parameters. |
| logger?            | An optional logger. The default logger prints output to the console, but it can be replaced with anything that complies with the Logger interface. |

**Note:** WASM-optimization is available for certain [finite fields](https://github.com/GuildOfWeavers/galois#wasm-optimization) and [hash functions](https://github.com/GuildOfWeavers/merkle#hash). If the field or the hash function you are using does not support WASM-optimization, a warning will be printed and its JavaScript equivalents will be used. In general, WASM optimization can speed up STARK proof time by 2x - 5x.

### Security options
Security options parameter should have the following form:

| Property           | Description |
| ------------------ | ----------- |
| extensionFactor?   | Number by which the execution trace is "stretched." Must be a power of 2 at least 2x of the constraint degree, but cannot exceed 32. This property is optional, the default is smallest power of 2 that is greater than 2 * constraint degree. |
| exeQueryCount? | Number of queries of the execution trace to include into the proof. This property is optional; the default is 80; the max is 128. |
| friQueryCount? | Number of queries of the columns of low degree proof to include into the proof. This property is optional; the default is 40; the max is 64. |
| hashAlgorithm?     | Hash algorithm to use when building Merkle trees for the proof. Currently, can be one of the following values: `sha256`, `blake2s256`. This property is optional; the default is `sha256`. |

### Optimization options
Optimization options parameter should have the following form:

| Property           | Description |
| ------------------ | ----------- |
| initialMemory?     | Initial number of bytes to allocate for WASM optimization; the default is 32 MB. |
| maximumMemory?     | Maximum number of bytes to allocate for WASM optimization; the default is 2 GB.  |

## Generating proofs
Once you have a `Stark` object, you can start generating proofs using `Stark.prove()` method like so:
```TypeScript
const proof = myStark.prove(assertions, initValues, publicInputs?, secretInputs?);
```
The meaning of the parameters is as follows:

| Parameter     | Description |
| ------------- | ----------- |
| assertions    | An array of [Assertion](#Assertions) objects (also called boundary constraints). These assertions specify register values at specific steps of a valid computation. At least 1 assertion must be provided. |
| inputs        | An array containing initialization values for all `$i` registers. Must contain at least one set of values. |
| auxPublicInputs? | An array containing initialization values for all `$p` registers. This parameter is optional and can be skipped if no public auxiliary inputs have been defined. |
| auxSecretInputs? | An array containing initialization values for all `$s` registers. This parameter is optional and can be skipped if no secret auxiliary inputs have been defined. |

### Inputs
Handling of inputs deserves a bit more explanation. As described above, there are 3 ways to supply inputs to `STARK.prove()` method:

* `inputs` parameter is always required. It is used to initialize the execution trace for different instances of the computation. The structure of `inputs` must match the structure of input loops defined in transition function. For more information, see [Input loops](https://github.com/GuildOfWeavers/AirScript#input-loops) section of AirScript documentation.
* The other two parameters provide values for the input registers defined in the STARK. To learn more about these, refer to [Readonly registers](https://github.com/GuildOfWeavers/AirScript#readonly-registers) section of AirScript documentation. These parameters are required only if STARK's definition includes auxiliary input registers.

For example, the fragment below specifies that a STARK must have a single `$i` register of depth 0, and 3 auxiliary input registers. Moreover, prefixes `$p` and `$s` specify that 2 of the auxiliary registers are *public* (the values will be known to the prover **and** the verified), and 1 of the registers is *secret* (the values will be known **only** to the prover).
```
transition 1 register {
    for each ($i0) {
        init { $i0 }
        for steps [1..63] { $r0 + 2 }
    }
}

using 3 readonly registers {
    $p0: repeat [...];
    $p1: spread [...];
    $s0: spread [...];
}
```

Based on this definition, the parameters for `STARK.prove()` method should be supplied like so:

```TypeScript
// let's say we want to run the computation for 2 sets of inputs
let inputs = [[1n], [2n]];

// define values for public auxiliary inputs
let pValues1 = [1n, 2n, 3n, 4n];
let pValues2 = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 7n];

// define values for secret auxiliary inputs
let sValues = [10n, 11n, 12n, 13n];

// generate the proof
let proof = fooStark.prove(assertions, inputs, [pValues1, pValues2], [sValues]);
```
When the proof is generated, the provided values will "appear" in registers `$i0`, `$p0`, `$p1`, and `$s0` to be used in transition function and transition constraints. The rules for how this happens are also described in the [Input loops](https://github.com/GuildOfWeavers/AirScript#input-loops) and  [Readonly registers](https://github.com/GuildOfWeavers/AirScript#readonly-registers) sections of AirScript documentation.


## Verifying proofs
Once you've generated a proof, you can verify it using `Stark.verify()` method like so:

```TypeScript
const result = myStark.verify(assertions, proof, auxPublicInputs?);
```
The meaning of the parameters is as follows:

| Parameter     | Description |
| ------------- | ----------- |
| assertions    | The same array of [Assertion](#Assertions) objects that was passed to the `prove()` method. |
| proof         | The proof object that was generated by the `prove()` method. |
| auxPublicInputs? | An array containing initialization values for all `$p` registers. This parameter is optional and can be skipped if no public auxiliary inputs have been defined. |

Verifying a proof basically attests to something like this: 

>If you start with some set of inputs (known to the prover), and run the computation for the specified number of steps, the execution trace generated by the computation will satisfy the specified assertions.

## Assertions
Assertions (or boundary constraints) are objects that specify the exact value of a given mutable register at a given step. An assertion object has the following form:

```TypeScript
interface Assertion {
    register: number;   // index of a mutable register
    step    : number;   // step in the execution trace
    value   : bigint;   // value that the register should have at the specified step
}
```

# Performance
Some very informal benchmarks run on Intel Core i5-7300U @ 2.60GHz (single thread):

| STARK                         | Field Size | Degree | Registers | Steps          | Proof Time | Proof Size |
| ----------------------------- | :--------: | :----: | :-------: | :------------: | :--------: | :--------: |
| MiMC                          | 128 bits   | 3      | 1         | 2<sup>13</sup> | 1.3 sec    | 95 KB      |
| MiMC                          | 128 bits   | 3      | 1         | 2<sup>17</sup> | 23 sec     | 147 KB     |
| MiMC                          | 256 bits   | 3      | 1         | 2<sup>13</sup> | 11.5 sec   | 108 KB     |
| MiMC                          | 256 bits   | 3      | 1         | 2<sup>17</sup> | 230 sec    | 165 KB     |
| Merkle Proof (Rescue, d=8)    | 128 bits   | 5      | 8         | 2<sup>8</sup>  | 300 ms     | 60 KB      |
| Merkle Proof (Rescue, d=16)   | 128 bits   | 5      | 8         | 2<sup>9</sup>  | 600 ms     | 72 KB      |
| Merkle Proof (Poseidon, d=8)  | 128 bits   | 8      | 12        | 2<sup>9</sup>  | 900 ms     | 74 KB      |
| Merkle Proof (Poseidon, d=16) | 128 bits   | 8      | 12        | 2<sup>10</sup> | 1.8 sec    | 84 KB      |

STARKs in the above examples have security parameters set to provide ~96 bits security.

**Note 1:** Rescue and Poseidon hash function instantiations are not really "apples-to-apples" - refer to [here](/examples/rescue) and [here](/examples/poseidon) for exact parameters.

**Note 2:** Currently, STARKs in 128-bit fields are able to take advantage of WebAssembly optimization, and thus, are much faster than STARKs in 256-bit fields.

# References
This library is originally based on Vitalik Buterin's [zk-STARK/MiMC tutorial](https://github.com/ethereum/research/tree/master/mimc_stark). Other super useful resources:

* STARKs whitepaper: [Scalable, transparent, and post-quantum secure computational integrity](https://eprint.iacr.org/2018/046.pdf)

Vitalik Buterin's blog series on zk-STARKs:
* [STARKs, part 1: Proofs with Polynomials](https://vitalik.ca/general/2017/11/09/starks_part_1.html)
* [STARKs, part 2: Thank Goodness it's FRI-day](https://vitalik.ca/general/2017/11/22/starks_part_2.html)
* [STARKs, part 3: Into the Weeds](https://vitalik.ca/general/2018/07/21/starks_part_3.html)

StarkWare's STARK Math blog series:
* [STARK Math: The Journey Begins](https://medium.com/starkware/stark-math-the-journey-begins-51bd2b063c71)
* [Arithmetization I](https://medium.com/starkware/arithmetization-i-15c046390862)
* [Arithmetization II](https://medium.com/starkware/arithmetization-ii-403c3b3f4355)
* [Low Degree Testing](https://medium.com/starkware/low-degree-testing-f7614f5172db)
* [A Framework for Efficient STARKs](https://medium.com/starkware/a-framework-for-efficient-starks-19608ba06fbe)

Other STARK libraries:

* [Hodor](https://github.com/matter-labs/hodor) from Matter Labs.
* [OpenZKP](https://github.com/0xProject/OpenZKP) from 0xProject.

# License
[MIT](/LICENSE) © 2019 Guild of Weavers
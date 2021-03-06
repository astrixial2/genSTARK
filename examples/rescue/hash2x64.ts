// IMPORTS
// ================================================================================================
import { Stark, createPrimeField } from '../../index';
import { Rescue } from './utils';

// STARK PARAMETERS
// ================================================================================================
const field = createPrimeField(2n**64n - 21n * 2n**30n + 1n);
const steps = 32;
const alpha = 3n;
const invAlpha = -6148914683720324437n;

// MDS matrix and its inverse
const mds = [
    [18446744051160973310n, 18446744051160973301n],
    [                   4n,                   13n]
];

// Key constant parameters
const constants  = [
     1908230773479027697n, 11775995824954138427n,
    18345613653544031596n,  8765075832563166921n,
    10398013025088720944n,  5494050611496560306n,
    17002767073604012844n,  4907993559994152336n
];

// create rescue instance, and use it to calculate key constants for every round of computation
const rescue = new Rescue(field, alpha, invAlpha, 2, steps, mds, constants);
const keyStates = rescue.unrollConstants();
const { initialConstants, roundConstants } = rescue.groupConstants(keyStates);

// STARK DEFINITION
// ================================================================================================
const rescueStark = new Stark(`
define Rescue2x64 over prime field (2^64 - 21 * 2^30 + 1) {

    alpha: 3;
    inv_alpha: 6148914683720324437;

    MDS: [
        [18446744051160973310, 18446744051160973301],
        [                   4,                   13]
    ];

    INV_MDS: [
        [ 2049638227906774814,  6148914683720324439],
        [16397105823254198500, 12297829367440648875]
    ];

    transition 2 registers {
        for each ($i0, $i1) {
            init [$i0, $i1];

            for steps [1..31] {
                S <- MDS # $r^alpha + $k[0..1];
                MDS # (/S)^(inv_alpha) + $k[2..3];
            }
        }
    }

    enforce 2 constraints {
        for each ($i0, $i1) {
            init {
                [$i0, $i1] = $n;
            }

            for steps [1..31] {
                S <- MDS # $r^alpha + $k[0..1];
                N <- (INV_MDS # ($n - $k[2..3]))^alpha;
                S = N;
            }
        }
    }

    using 4 readonly registers {
        $k0: repeat [${roundConstants[0].join(', ')}];
        $k1: repeat [${roundConstants[1].join(', ')}];
        $k2: repeat [${roundConstants[2].join(', ')}];
        $k3: repeat [${roundConstants[3].join(', ')}];
    }
}`);

// TESTING
// ================================================================================================
// Generate proof that hashing 42 with Rescue results in 14354339131598895532

// set up inputs and assertions
const initValues = [buildInputs(42n)];
const assertions = [
    { step: steps-1, register: 0, value: 14354339131598895532n }
];

// generate a proof
const proof = rescueStark.prove(assertions, initValues);
console.log('-'.repeat(20));

// verify that the prover knows the value that hashes to 14354339131598895532
rescueStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(rescueStark.sizeOf(proof) / 1024 * 100) / 100} KB`);

// HELPER FUNCTIONS
// ================================================================================================
/** Pre-computes the first step of Rescue computation */
function buildInputs(value: bigint) {
    const r = [
        field.add(value, initialConstants[0]),
        field.add(0n, initialConstants[1])
    ];

    // first step of round 1
    let a0 = field.exp(r[0], invAlpha);
    let a1 = field.exp(r[1], invAlpha);

    r[0] = field.add(field.add(field.mul(mds[0][0], a0), field.mul(mds[0][1], a1)), initialConstants[2]);
    r[1] = field.add(field.add(field.mul(mds[1][0], a0), field.mul(mds[1][1], a1)), initialConstants[3]);

    return r;
}

/* EXECUTION TRACES
 * ================================================================================================
 * Execution traces of Rescue computation are shown below:
 * - on the left: the execution trace of running Sponge() method with input [42]; in this case,
 *   a state is recorded after each step (2 per round).
 * - on the right: the execution trace from STARK computation; in this case, step 2 in a given round
 *   is combined with step 1 from the following round as described in the whitepaper. So, the trace
 *   can skip every other step. Also, the execution trace terminates after 1st step of round 32.
 *   
 *                  ╒═══════════ Original Function ═════════════╕       ╒═════════════════ STARK ═══════════════════╕
 *  round   step    r0                      r1	                    |   r0                     r1
 *  0	    1       42                      0                       |
 *  0	    2       1908230773479027739	    11775995824954138427    |
 *  1	    1       6192394074115262567	    6362103795149910654     |   6192394074115262567    6362103795149910654     <- STARK starts out with these inputs
 *  1	    2       14235436695667447389    10212112854719144682    |
 *  2	    1       4443483495863871585	    18213808804803479104    |   4443483495863871585    18213808804803479104
 *  2	    2       7741183469403798391	    6347331225803919751     |
 *  3	    1       12298482428329212698    17330962085246333408    |   12298482428329212698   17330962085246333408
 *  4	    2       5625787762739911842	    7298309140415770238     |
 *  5	    1       8313646796226318584	    11641010825224956624    |   8313646796226318584    11641010825224956624
 *  5	    2       3536971337043492177	    6199877634490347893	    |
 *  6	    1       978482924564259844	    1504772570823547853     |   978482924564259844     1504772570823547853
 *  6	    2       9587772738143780865	    593371534470436793	    |
 *  7	    1       5186520612742714234	    12963908037192828019    |   5186520612742714234    12963908037192828019
 *  7	    2       14958006020707970142    5812678940633129397	    |
 *  8	    1       13556844045322480200    9370255526245022324	    |   13556844045322480200   9370255526245022324
 *  8	    2       5209123743309416556	    3421448805653717044	    |
 *  9	    1       6826812100069596115	    3767734035057720904	    |   6826812100069596115    3767734035057720904
 *  9	    2       7004361282643535514	    13669693348850263283    |
 *  10      1       9188856226247543083	    3351687690081566017	    |   9188856226247543083    3351687690081566017
 *  10      2       7323944770063389994	    12223102134895448980    |
 *  11      1       4083560747908219027	    18221171377692901817    |   4083560747908219027    18221171377692901817
 *  11      2       7318846094432971572	    12454705956386970160    |
 *  12      1       15718390384883760212    12316572311146424020    |   15718390384883760212   12316572311146424020
 *  12      2       1352768701059281571	    3678128971630195068	    |
 *  13      1       1125051307685663609	    10573679192340848849    |   1125051307685663609    10573679192340848849
 *  13      2       3918655941418559040	    11114931694193189358    |
 *  14      1       17514012653621998088    16649558855481918050    |   17514012653621998088   16649558855481918050
 *  14      2       15319837560709914379    9705703502808935406     |
 *  15      1       9391214203397792708	    8948807049610907051	    |   9391214203397792708    8948807049610907051
 *  15      2       17039140040797699685    5648355597923301468	    |
 *  16      1       11869417477045016900    16125602680661515208    |   11869417477045016900   16125602680661515208
 *  16      2       10879959665900478916    9788819506433475326	    |
 *  17      1       15622260264780797563    17676602026916942111    |   15622260264780797563   17676602026916942111
 *  17      2       9970875907496364816	    4018854804967493775	    |
 *  18      1       11263866506403296395    3395909349124497933	    |   11263866506403296395   3395909349124497933
 *  18      2       12206504669047766550    2737018831357445192	    |
 *  19      1       7436209647172616652	    11095546667438737832    |   7436209647172616652    11095546667438737832
 *  19      2       12951191624543726317    11756918128517485528    |
 *  20      1       13977911137029292561    7123382562034869052	    |   13977911137029292561   7123382562034869052
 *  20      2       10196137702945530755    16530008975547478480    |
 *  21      1       12765915320184852297    18222710437499261781    |   12765915320184852297   18222710437499261781
 *  21      2       3510101432442295756	    7047970939047430590	    |
 *  22      1       4203432975434035702	    17217054318931531174    |   4203432975434035702    17217054318931531174
 *  22      2       6919336185017279297	    10751714047033011969    |
 *  23      1       9513331167665760302	    6625246843962557911	    |   9513331167665760302    6625246843962557911
 *  23      2       8322671683267467626	    4448047256709285629	    |
 *  24      1       700236991263439132	    7713484789770087182	    |   700236991263439132     7713484789770087182
 *  24      2       10793159502592859380    3678186958707583345	    |
 *  25      1       2053364846065995957	    10256034168563840023    |   2053364846065995957    10256034168563840023
 *  25      2       5936500212438068751	    1562077346057657164	    |
 *  26      1       790388693683446933	    13255618738266494252    |   790388693683446933     13255618738266494252
 *  26      2       15285257528619465884    12449196848526946550    |
 *  27      1       12872121840946251064    16031903000986157337    |   12872121840946251064   16031903000986157337
 *  27      2       14878452572381778262    8518840370028919097	    |
 *  28      1       17025530959440937859    17460181414067351157    |   17025530959440937859   17460181414067351157
 *  28      2       1714977379946141684	    14870879752778004505    |
 *  29      1       15097183929335660856    8195117861635325551	    |   15097183929335660856   8195117861635325551
 *  29      2       79198607169113554	     6547868967680134508    |
 *  30      1       11005033986037753086    8639151511101212086	    |   11005033986037753086   8639151511101212086
 *  30      2       13306767687057932694    2408861729904106632	    |
 *  31      1       427504626455762595	    15713595349449078118    |   427504626455762595     15713595349449078118
 *  31      2       893215822675986474	    16013196806403095800    |
 *  32      1       14354339131598895532    13089448190414768876    |   14354339131598895532   13089448190414768876    <- STARK terminates 1 step earlier
 *  32      2       18174939043219985060    17194445737515289373    |
*/ 
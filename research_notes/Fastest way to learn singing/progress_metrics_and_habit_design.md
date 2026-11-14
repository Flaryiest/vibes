# Progress metrics and habit design for a beginner singing-practice app

Provenance tags used below: **[P]** = I read the primary full text; **[A]** = abstract or search-snippet level only; **[S]** = secondary or popular source. Evidence strength is marked **Strong** (meta-analysis or several converging studies), **Moderate** (a few peer-reviewed studies), **Weak** (single small study, company self-report, practitioner writing) or **Unverified**. Notes compiled 2026-11-13.

## 1. Which objective metrics quantify singing ability, and which are reliably measurable for a beginner with a laptop/phone mic in a browser?

### Takeaway
The research standard is note-level pitch error in cents against a known target, reported two ways: mean absolute deviation and percentage of notes inside a ±50-cent window; the ±50-cent hit rate is the single measure that best matches expert listeners (r = .92). Pitch-based metrics (accuracy, precision, interval error, drift, range) are robust on consumer microphones; perturbation measures (jitter, shimmer, HNR) are not and should not be tracked.

### Cited Findings
- **Pitch deviation and error rate (Strong).** Standard scoring extracts F0 by autocorrelation, converts to cents, and takes the difference between sung and target pitch per note; an "error rate" codes every note outside ±50 cents as wrong. Worked example: deviations of −30, +40, −60, +200 cents give a mean absolute deviation of 82.5 cents and an error rate of 50%. [P] — [Demorest & Pfordresher 2015, Music Perception](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Validity against human judges (Moderate).** Acoustic ±50-cent error rate correlated r(152) = .92 with expert ratings; mean cent deviation correlated r = .87. Acoustic scoring was consistently more conservative than human judges. The authors recommend the pitch-by-pitch ±50-cent error rate as the best automated stand-in for human judgment. [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Why ±50 cents.** 50 cents is "the dividing line between proximity to the intended pitch class and an alternate pitch class"; a singer is classed "accurate" if at least 90% of notes fall inside it (Hutchins & Peretz criterion). [P] — [Pfordresher & Demorest 2021, JRME](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf)
- **±100 cents is too lenient for tracking skill.** At ±100 cents a singer aiming for C–E could sing C–E♭ or C–F and still count as accurate; that criterion was designed to flag outliers with a singing "disorder". [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Accuracy vs precision (Strong).** Accuracy = closeness of the average sung pitch to target; precision = consistency (SD) across repeated attempts at the same pitch or interval. Both exist in absolute (note) and relative (interval) forms. Sung Performance Battery formulas: accuracy = |mean signed deviation|; precision = SD of produced pitch within each pitch/interval class, averaged over classes; interval deviation = mean absolute difference between sung and notated intervals; interval error = sung interval off by a semitone or more; contour error = wrong direction. [P via PMC] — [Berkowska & Dalla Bella 2013, Frontiers in Psychology](https://pmc.ncbi.nlm.nih.gov/articles/PMC3799299)
- **Imprecision is more common than inaccuracy.** Pfordresher et al. (2010) found 56% of singers imprecise (SD of pitch error > 1 semitone) but only 13% inaccurate (mean error > 1 semitone). [P, as cited in] — [Mauch, Frieler & Dixon 2014, JASA](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **How to get one pitch per note (Moderate).** Take the median of the frame-level F0 estimates (YIN) over the note. The median is robust to where note boundaries are placed: across annotators the average difference was < 0.2 cents and only 1.4% of notes differed by > 5 cents. [P] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Interval error and drift (Moderate).** For unaccompanied song singing the paper defines mean absolute pitch error (MAPE) and mean absolute interval error (MAIE). In 24 mostly experienced amateur singers singing "Happy Birthday" three times: MAPE averaged 0.19 semitones (19 cents), MAIE about 26 cents, and median absolute drift was 11 cents over 50 s. Drift was statistically significant in only 22% of recordings and did not correlate with accuracy or experience. [P] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Onset scoops matter perceptually (Moderate).** Listeners judging tuning average pitch across the note but also treat a scoop (pitch glide at note start or end) as a distinct feature; ending scoops affected judgments more than starting ones. [A] — [Larrouy-Maestri & Pfordresher 2018, JEP:HPP](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2018/09/Larrouy-Maestri-Pfordresher_inpress.pdf)
- **Vocal range.** The SPB measures singing range with an adaptive staircase from a comfortable pitch (3-semitone steps, then 2, then 1; boundary = mean of last three reversals; each note held 3 s). Mean singing range in 50 occasional singers was 18.5 semitones (SD 4.6). [P via PMC] — [Berkowska & Dalla Bella 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3799299)
- **Voice Range Profile (phonetogram).** A full VRP samples minimum and maximum intensity at every semitone; data-collection procedures vary widely between clinicians and labs. Untrained adults (n = 63) show high test-retest reliability, and protocol choice changes the size of the measured range. [A] — [2020 AJSLP systematic review](https://pubs.asha.org/doi/10.1044/2020_AJSLP-20-00023); [Sanchez et al. 2013](https://informahealthcare.com/doi/full/10.3109/14015439.2013.777109)
- **Vibrato (reference values only).** Professional classical singers: mean rate about 6 Hz, extent ±34 to ±123 cents with a mean of ±71 cents (Prame, cited secondarily). [S] — [IJRCS choral study](https://acda-publications.s3.us-east-2.amazonaws.com/IJRCS/IJRCS5-1mann.pdf); [Larrouy-Maestri et al. 2014](https://orbi.uliege.be/bitstream/2268/158220/1/Larrouy-Maestri_OperaticVoices_JV_2014.pdf)
- **Maximum phonation time.** Healthy older men averaged 23.2 s (women 21.0 s); clinical reference tables give about 26 s average (25–35 s range) for men aged 16–64; another reference sheet says adults typically sustain 15–20 s. Sources disagree by population and vowel. [A/S] — [Maslan et al. 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3128209); [clinical norms table](https://theadultspeechtherapyworkbook.com/norms-for-voice/); [Sydney Voice Lab reference sheet](https://www.sydney.edu.au/content/dam/corporate/documents/faculty-of-medicine-and-health/research/research-centres/sydney-voice-lab/acoustic-analysis-normative-data-reference-sheet-20250416_v4.0-sydney-voice-lab.pdf.coredownload.pdf)
- **Jitter, shimmer, HNR on consumer devices (Moderate, negative).** Across smartphone types, mean F0 and CPPS showed acceptable random error, but jitter (RAP) and shimmer % showed large random errors and were judged not reliable enough for practical use. HNR and CPP shift with recording environment, microphone type and device position. A 2025 meta-analysis still found inconsistency between smartphone and clinical-system voice-quality parameters. [A] — [Jannetts et al. 2019](https://read.qxmd.com/read/30779425/assessing-voice-health-using-smartphones-bias-and-random-error-of-acoustic-voice-parameters-captured-by-different-smartphone-types); [2020 JSLHR study](https://pubs.asha.org/doi/10.1044/2020_JSLHR-20-00212); [2024 JSLHR](https://pubs.asha.org/doi/10.1044/2024_JSLHR-23-00759); [2025 AJSLP meta-analysis](https://pubs.asha.org/doi/10.1044/2025_AJSLP-25-00140)
- **Online recordings can be unusable.** In a 632-person online singing test, recordings from 100 participants (16%) were not of sufficient audio quality for song scoring. [P] — [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf)

### Inferences
- Recommended metric set, ranked by usefulness for this user (my synthesis of the findings above; "beginner" and "intermediate" bands are derived from the population values in section 3, not published cut-offs):

| Metric | How to compute from mic audio | Beginner baseline | Intermediate target | Browser reliability |
|---|---|---|---|---|
| Hit rate (headline) | % of notes whose median F0 is within ±50 cents of target | 45–75% | ≥ 90% | High |
| Tight hit rate (stretch) | Same at ±25 cents | Low | Rising trend | High |
| Mean absolute deviation | Mean of abs(cents error) per note | 65–125 cents | ≤ 50 cents; experienced amateurs 20–30 | High |
| Signed bias | Mean signed cents error (flat vs sharp) | Any consistent sign | Near 0 | High |
| Precision | SD of cents error across repeats of the same note | ~60 cents | ≤ 40 cents | High |
| Interval error | abs(sung interval − target interval) in cents | 50–100 cents | ~25 cents | High |
| Sustained-note stability | SD of frame F0 (cents) over the steady part of a 3–5 s note; slope = drift | No norms found | Falling trend | High |
| Onset time-to-target | ms from voicing onset until F0 stays within ±50 cents | No norms found | Falling trend | Medium |
| Comfortable range | Lowest/highest note sustained ≥ 2 s within ±50 cents | ~18 semitones | Slow growth | Medium (low end is hardest) |
| Maximum phonation time | Longest voiced duration on one breath | ~20–26 s | Optional | High |
| Vibrato rate/extent | Periodicity of F0 around the note mean | Not applicable | Not applicable | Skip for a beginner |
| Jitter / shimmer / HNR | Cycle-level perturbation | — | — | Do not track |

- Signed bias is cheap to compute and more actionable than absolute error: "you are consistently 30 cents flat" tells the learner what to change, whereas a mixed-sign error with the same absolute size is a precision problem.
- Sustained-note stability and time-to-target are natural by-products of frame-level pitch tracking, but I found no published beginner norms, so they should be shown only as personal trends.

### Gaps
- No published norms for within-note F0 stability or scoop duration in untrained adults were found.
- Timing/rhythm accuracy: the SPB paper explicitly excluded its rhythm analyses and points to Dalla Bella et al. (2007), which I did not retrieve; no cited beginner values for onset-timing error are available here.
- Male-specific vocal-range norms in semitones (untrained) were not retrieved; the Sanchez 2013 and Heylen 2002 papers would have them.
- Prame's vibrato figures and the MPT norms come from secondary citations and were not checked against the originals.

## 2. What standard protocols exist, what tasks do they use, and what are the scoring thresholds?

### Takeaway
All major batteries share one structure: find the singer's comfortable range first, then test single-pitch matching, short patterns or intervals, and a familiar song from memory, scoring notes against a ±50-cent (strict) or ±100-cent (lenient) window. The Seattle Singing Accuracy Protocol is the shortest validated design (44 scored notes plus a song) and is the best template for an in-app benchmark.

### Cited Findings
- **SSAP design goals.** Created at the October 2013 Seattle symposium to be short, easy to administer, and automatically scorable, so that results are comparable across studies and ages. [P] — [Demorest et al. 2015, Music Perception](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **SSAP step 1, comfortable range.** Three quick tasks: count backwards from ten (mean speaking pitch predicts singing pitch), sing a familiar song with no starting pitch, and sustain one comfortable pitch on "oo". The average sets a comfort pitch so that "accuracy problems are not a result of being asked to sing outside of a comfortable range". [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **SSAP step 2, imitation tasks.** Targets span only a perfect fifth centred on the comfort pitch. (a) 10 single pitches from a recorded human voice matching the singer's sex and range (5 pitches × 2); (b) 10 single pitches in piano timbre; (c) six four-note patterns, 3 ascending and 3 descending (solfège: D-R-M-S, S-F-M-D, D-S-F-M, S-D-R-M, D-M-R-S, S-M-F-D). A practice example precedes each block. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **SSAP step 3, song from memory.** One familiar song a cappella on text, then on a neutral syllable ("doo" preferred to "la" because stop consonants segment more reliably). Suggested songs, easiest first: Jingle Bells, Frère Jacques, Twinkle Twinkle, Happy Birthday. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **SSAP steps 4–5.** A 2–4 minute adaptive pitch-discrimination staircase around 500 Hz (to rule out a perceptual deficit) and a short background questionnaire including self-ratings such as "I enjoy singing". [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **SSAP as run online.** Comfort key from a self-chosen song plus a 2-second sustained "oo", analysed with YIN; maximum imitation score is 44 notes (10 + 10 + 24), reported as proportion of notes within ±50 cents; song scored by raters on a revised Wise & Sloboda scale; participants see their scores immediately afterwards. Imitation and song scores correlated r(530) = .61. [P] — [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf)
- **Automated song scoring is the hard part.** Acoustic scoring of song singing "requires that each tone of the melody be isolated manually"; neutral-syllable singing is included because it is easier to segment automatically. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **Sung Performance Battery (SPB).** Range assessment, then five tasks: (1) single-pitch matching, 24 trials over 12 chromatic notes centred on the range midpoint; (2) pitch-interval matching, 25 intervals from minor 2nd to octave, up and down; (3) six novel six-note melodies; (4) familiar songs from memory with lyrics and on "la" at free tempo; (5) the same songs at a slow metronome tempo (80–125 bpm). Poor-pitch criteria: fixed 50 or 100 cents, or more than 2 SD from the group mean. [P via PMC] — [Berkowska & Dalla Bella 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3799299)
- **AIRS Test Battery of Singing Skills.** Broader, lifespan-oriented: a familiar song (Brother John), learning a new song, lowest and highest notes, pitch matching to voice and piano, four-note melodies, improvising a song ending and composing a new song, plus verbal tasks. [A] — [Cohen 2015, Musicae Scientiae](https://journals.sagepub.com/doi/10.1177/1029864915599599); [AIRS sub-theme page](https://airsplace.ca/subtheme-1-3-members)
- **Web-based singing tests are valid.** The Melbourne online singing tool showed Cronbach's alpha = .92 and test-retest reliabilities of .65–.80; web and lab participants matched on age, sex and training did not differ (n = 82). [A] — [Tan, Peretz, McPherson & Wilson 2021, Music Perception](https://www.sciencegate.app/document/10.1525/mp.2021.38.4.386)
- **Pfordresher's public online test.** The University at Buffalo released an automated online SSAP that returns a pitch-accuracy score on completion. [S] — [UB news release 2017](https://www.buffalo.edu/news/releases/2017/01/038.html)

### Inferences
- Recommended benchmark protocol for the app (about 8–10 minutes, derived from SSAP with two SPB additions):
  1. Fixed conditions: same device and mic position, quiet room, reference tones through headphones, after the same short warm-up.
  2. Comfort-pitch check: sustain "oo" for 2 s (first run only: also count backwards from ten).
  3. Single-pitch matching, voice-like timbre in his own octave: 5 scale degrees × 2 = 10 notes.
  4. Single-pitch matching, piano timbre: 10 notes.
  5. Six four-note patterns from the SSAP list: 24 notes.
  6. Sustained note: hold the comfort pitch 5 s (stability, drift, onset time).
  7. Range probe: SPB staircase down and up (monthly rather than weekly, to limit strain).
  8. Song: the same short song on "doo", recorded and stored for before/after listening.
- Headline score = % of the 44 imitation notes within ±50 cents; secondary = mean absolute deviation, signed bias, precision. This keeps the score directly comparable with published SSAP data.
- The speaking-pitch step (counting backwards from ten) is a low-embarrassment way to place a first-time singer's range before he has sung anything.

### Gaps
- SSAP-specific adult test-retest reliability was not found; the closest figures are the Melbourne tool (.65–.80) and a child study (r = .69, see section 4).
- Details of the AIRS battery scoring were not retrieved (2015 paper is paywalled).

## 3. What do typical values look like for untrained, occasional and trained singers, and what counts as "in tune" to listeners?

### Takeaway
An untrained adult typically lands 55–75% of single pitches within ±50 cents and misses by roughly 65–125 cents on average depending on task difficulty; people with training cluster above 90%; experienced amateurs and professionals sit around 20–35 cents. Listeners begin to hear sung notes as out of tune somewhere between about 20 and 50 cents, so ±50 is a sound "pass" line and ±25 a sound "polished" line.

### Cited Findings
- **Untrained college adults (n = 78), SSAP-style tasks.** Error rate at ±50 cents / mean absolute deviation: single pitch 26.2% / 66 cents; intervals 39.6% / 87 cents; four-note patterns 53.7% / 124 cents; overall 41.8% / 92 cents. Sixth graders in regular school music did better (20.5% / 51 cents); kindergartners were similar to the adults (48.7% / 109 cents). [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **"Use it or lose it".** From grade 6 to college the gains "almost completely reversed"; grade 6 was the only group whose modal performance was above 90% of notes correct. The authors argue against the idea that accuracy simply improves with age. Only 5% of the adults met the "90% of pitches within ±50 cents" criterion, against 45% of sixth graders. [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Other single-pitch figures for untrained adults.** 74% of single pitches correct in Pfordresher & Brown (2007); 59% for non-musicians in Hutchins & Peretz (2012). [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Hutchins & Peretz (2012), strict criterion.** Among 53 non-musician adults (under one year of training), at ±50 cents only 38% matched at least 90% of pitches, and 47% failed to match even half. [P, as cited in] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Lenient criterion.** At ±100 cents, 85–90% of the population sing "accurately" (Dalla Bella et al. 2007; Pfordresher & Brown 2007), and most people are too harsh in their self-assessment. [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Large online sample (N = 632, ages 6–99).** About half scored above 90% within ±50 cents. No private lessons (n = 292): mean 68%, median 78%. Private lessons (n = 340): mean 87%, median 94%. Choir members 87.6% vs others 77.4%. Years of training correlated r = .30 with pitch matching; pitch-discrimination threshold r = −.31; age only r = .09. [P] — [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf)
- **Occasional singers on the SPB (n = 50).** Single-pitch absolute accuracy: mean 140 cents, median 88 cents; precision median 60 cents. Interval task: relative accuracy median 80 cents, relative precision median 41 cents. Familiar song: relative (interval) accuracy 17–26 cents, pitch-interval deviation 44–57 cents. 58% exceeded 50 cents and 48% exceeded 100 cents on single-pitch accuracy; using a 2-SD criterion, 14 of 50 (28%) were poor-pitch singers. [P via PMC] — [Berkowska & Dalla Bella 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3799299)
- **Occasional vs professional, familiar song.** Occasional singers' interval errors averaged about 0.6–0.9 semitones; professionals about 0.3 semitones (Dalla Bella et al. 2007). [P, as cited in] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Experienced amateurs.** 24 singers (13 with "a lot" of singing experience): median note error 19 cents, MAIE about 26 cents; self-rated ability and choir experience correlated significantly with both. [P] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Professionals are not perfect.** Vurma & Ross (2006): professional singers' intervals had an average SD of 22 cents, and 34 cents in absolute pitch relative to a tuning fork; errors of even 40 cents were not reliably judged out of tune by most listeners. [P, as cited in] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Perception is rarely the bottleneck.** Non-musicians matched pitch with a slider at 97% accuracy but only 59% when singing; musicians were near-perfect on both. About 20% of non-musicians were impaired at matching even their own recorded voice, pointing to vocal-motor control. [S/A] — [BRAMS summary](https://brams.org/2012/02/07/a-frog-in-your-throat-or-in-your-ear/); [Hutchins, Larrouy-Maestri & Peretz 2014](https://link.springer.com/10.3758/s13414-014-0732-1)
- **Listener thresholds.** (a) Most listeners do not notice tuning errors in the voice until about 50 cents (the "vocal generosity effect"; tolerance is tighter for instruments). [A] — [Hutchins et al. 2014](https://link.springer.com/10.3758/s13414-014-0732-1). (b) In an adaptive test with pop excerpts, the median listener detected a vocal-track shift of 55 cents (95% range 36–83); high musical training about 43 cents, low training about 65 cents; the paper cites earlier thresholds of roughly 10–40 cents. [P via PMC] — [Larrouy-Maestri, Harrison & Müllensiefen 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6478636). (c) Conference reports put the point at which lay listeners call a melody "out of tune" near 20 cents, and about 10 cents for experts; a 2018 paper reports tolerance of "half of a quarter tone" (about 25 cents). [A, conference material] — [ESCOM 2015 abstract](https://orbi.uliege.be/bitstream/2268/186233/3/ESCOM_Abstract.pdf); [British Library record](https://eld.bl.uk/catalog/100078561527_0x000001)

### Inferences
- Realistic stage bands for this user (derived): **starting point** 45–75% of notes within ±50 cents and 65–125 cents mean deviation; **competent amateur** ≥ 90% within ±50 cents and ≤ 50 cents mean deviation; **polished** mean deviation 20–35 cents, the level of experienced choir singers and professionals. Below about 20–25 cents further gains are largely inaudible to ordinary listeners.
- The gap between untrained (median 78%) and trained (median 94%) singers is about 16 percentage points on the SSAP imitation score, so that is the meaningful span the app's headline number has to resolve.
- Task difficulty changes the score more than skill differences do (26% errors on single pitches vs 54% on patterns for the same adults), so progress must always be compared within the same task.

### Gaps
- One conflict: Demorest & Pfordresher (2015) describe "58% of occasional singers" in Berkowska & Dalla Bella (2013, Task 1) as matching single pitches correctly, while the SPB table as extracted lists 58% as exceeding the 50-cent criterion (inaccurate). The SPB median of 88 cents supports the second reading. The report writer should not quote the 58% figure without checking the SPB table.
- The listener-threshold literature mixes tasks (whole-track shifts, single notes, melodies) and several figures come from conference abstracts; treat 20–50 cents as a range, not a constant.
- No study was found giving cents-level values specifically for adult male beginners with low voices.

## 4. How often should a learner re-test, and how should noisy day-to-day measurements be presented?

### Takeaway
No study prescribes a re-test interval for singing; what the evidence does show is that single-session scores are noisy (test-retest about .65–.80), that warm-up state, target timbre, syllable and tempo all shift scores, and that recorded progress monitoring improves goal attainment (d ≈ 0.40). That supports a fixed weekly benchmark under identical conditions plus passive per-session metrics shown as smoothed trends.

### Cited Findings
- **Reliability of a single test.** Online adult singing tool: test-retest .65–.80, internal consistency .92. [A] — [Tan et al. 2021](https://www.sciencegate.app/document/10.1525/mp.2021.38.4.386). Children aged 6–11 re-tested within 1–6 weeks: r = .69, and scores rose across repeated attempts (a practice effect on the test itself). [A] — [Nichols, Musicae Scientiae](https://pure.psu.edu/en/publications/the-effect-of-repeated-attempts-and-test-retest-reliability-in-ch/)
- **More items give a steadier score.** In a related adaptive music-perception test, reliability was r = .70 with 30 items but r = .58 with 15. [P via PMC] — [Larrouy-Maestri et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6478636)
- **Warm-up state changes the numbers.** Choirs sang with the least pitch deviation after a combined physical/vocal warm-up; warm-up reduced frequency and amplitude perturbation in young singers, more so in the low range. [A] — [J Voice choir warm-up study](https://read.qxmd.com/read/28483445/the-effects-of-three-physical-and-vocal-warm-up-procedures-on-acoustic-and-perceptual-measures-of-choral-sound); [J Voice warm-up acoustic study](https://read.qxmd.com/read/15907439/evaluating-the-influence-of-warmup-on-singing-voice-quality-using-acoustic-measures)
- **Task conditions change the numbers.** Poor and inexperienced singers do better when the model's timbre matches their own voice than with piano; adults sing more accurately on a neutral syllable than with lyrics; patterns produce about twice the error rate of single pitches. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf); [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf); [Berkowska & Dalla Bella 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3799299)
- **Per-note robustness.** Using the median F0 per note makes note-level pitch nearly insensitive to segmentation choices. [P] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Monitoring progress works (Strong).** Meta-analysis of 138 studies (N = 19,951): interventions that increased progress monitoring improved goal attainment, d+ = 0.40 (95% CI 0.32–0.48); effects were larger when progress was physically recorded. [A] — [Harkin et al. 2016, Psychological Bulletin](https://eprints.whiterose.ac.uk/id/eprint/91437/)
- **Skill can move quickly.** A single 20-minute session of real-time visual feedback training produced significant pre-to-post gains on the SSAP in adult poor-pitch singers. [A] — [Berglin, Pfordresher & Demorest 2022, Psychology of Music](https://researchconnect.buffalo.edu/en/publications/the-effect-of-visual-and-auditory-feedback-on-adult-poor-pitch-re/)

### Inferences
- Sampling noise alone is large: with 44 scored notes and a true hit rate of 60%, the binomial standard error is about 7 percentage points, so a week-to-week change smaller than roughly 15 points is indistinguishable from noise on one test. Averaging four weekly benchmarks halves that. Notes inside a pattern are not independent, so real noise is probably somewhat larger.
- Design consequences: (1) one fixed benchmark per week, same tasks, same key, same device, after the standard warm-up, at a similar time of day; (2) plot individual benchmark results as faint points with a 3–4 test rolling median or a 28-day rolling mean as the main line; (3) show "change vs 4 weeks ago" rather than "change vs last session"; (4) compute session-level metrics automatically from normal exercises (thousands of notes per week give much tighter estimates than the benchmark) but never mix tasks of different difficulty in one trend line.
- Because repeated attempts inflate scores on a fixed test, expect a jump over the first two or three benchmarks that is partly test familiarity. Labelling the first three as "calibration" avoids a false plateau afterwards.
- The range probe should be less frequent (monthly) since physiological range changes slowly and pushing extremes repeatedly adds strain for no measurement benefit.

### Gaps
- No direct evidence on optimal benchmark frequency for singing learners, or on time-of-day effects on singing accuracy, was found.
- No study comparing smoothing methods (rolling mean, exponential smoothing) for learner-facing progress displays was found; the recommendation rests on basic measurement reasoning.

## 5. What is the value of qualitative tracking: repeated recordings, self-ratings and practice logs?

### Takeaway
Recordings are valuable mainly because singers cannot judge their own intonation while singing but can from playback; however, self-listening alone has small and inconsistent effects on skill, and works better paired with a model or objective feedback. Self-ratings correlate only moderately with measured accuracy and beginners tend to under-rate themselves.

### Cited Findings
- **In-the-moment self-judgment is unreliable, playback fixes it.** Professional singers could not tell immediately after singing whether their intervals were out of tune, but after listening to a recording their judgments did not differ from other expert listeners (Vurma & Ross 2006). [P, as cited in] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Self-listening and self-evaluation accuracy (Weak, mixed).** 26 undergraduate musicians who listened to their own recording before self-scoring were not significantly more accurate than controls (p = .09). [A] — [Summitt & Fisher 2016](https://scholarlypublishingcollective.org/uip/bcrme/article/doi/10.5406/bulcouresmusedu.209.0063/254508/Effect-of-Self-Listening-on-Self-Evaluation)
- **Self-listening changes self-perception more than expert-rated playing.** 25 advanced piano students: listening to their own recordings changed self-ratings (rhythm, interpretation), but expert ratings showed no significant effect. [A] — [Nusseck et al. 2025, Frontiers in Psychology](https://www.frontiersin.org/articles/10.3389/fpsyg.2025.1568021/full)
- **Self-listening plus a model beats self-listening alone.** Second-graders improved melodic accuracy when self-listening was combined with listening to a model; self-listening alone produced no gain. [A, thesis] — [Fixmer 2017, Indiana University](https://scholarworks.iu.edu/dspace/items/85e00f3a-9896-4e0e-b0e6-3daf22ebb502)
- **Self-ratings track measured ability only loosely.** Correlations between self-statements and measured pitch matching ranged from r = .18 ("I enjoy singing") to .33 ("People think I am a good singer") and .41 for the strongest item. [P] — [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf). The Melbourne tool found |r| = .31–.59 between self-rated ability and tasks. [A] — [Tan et al. 2021](https://www.sciencegate.app/document/10.1525/mp.2021.38.4.386)
- **Self-declared non-singers under-rate themselves.** Adults' assessed singing exceeded their own predicted ratings. [A] — [Knight 2010, UCL thesis](https://discovery-pp.ucl.ac.uk/id/eprint/10006515/1/knight2010.pdf)
- **Practice quantity and strategy predict persistence.** Children who quit within nine months had practised considerably less than those who continued, and strategy use predicted success better than accumulated hours. [P, as cited in] — [Evans, McPherson & Davidson 2013](https://selfdeterminationtheory.org/wp-content/uploads/2021/06/2013_EvansMcPhersonDavidson_Roleof.pdf)
- **Recorded monitoring has a larger effect than unrecorded.** [A] — [Harkin et al. 2016](https://eprints.whiterose.ac.uk/id/eprint/91437/)

### Inferences
- Keep a "same song, same key" recording at each benchmark and present it as an A/B player (first recording vs latest) alongside the pitch trace. The research suggests the motivational value comes from making improvement audible, while the learning value comes from pairing playback with a reference and an objective trace rather than from listening alone.
- A one-tap post-session rating (effort and throat strain, 1–5) is cheap and useful as a safety and load signal, but should not be treated as a skill measure given the weak self-rating correlations.
- The practice log should be automatic (minutes sung, notes attempted, exercises done). Manual logging adds friction with no evidence of extra benefit.

### Gaps
- No controlled study was found on whether periodic before/after recordings improve adult beginners' motivation or retention; the before/after idea is supported by inference and practitioner convention.
- No evidence was found on self-rated strain scales for untrained singers in a self-directed setting.

## 6. Low-voice specifics: measurement pitfalls for bass/baritone voices

### Takeaway
Low male voices are harder to track because each pitch period is long (about 15 ms at C2), semitones are only a few hertz apart, and browser speech-processing can distort sustained tones. Use a time-domain pitch tracker (YIN/pYIN/McLeod family) with a long enough window and a floor near 60–65 Hz, disable browser audio processing, present targets in the singer's own octave, and guard against octave errors.

### Cited Findings
- **Algorithm floor.** librosa's YIN/pYIN documentation recommends a minimum search frequency of C2 (about 65 Hz), "though lower values may be feasible", with a default frame of 2048 samples (about 93 ms at 22,050 Hz). [A] — [librosa.yin docs](https://librosa.org/doc/0.11.0/generated/librosa.yin.html)
- **Octave errors.** YIN-type detectors can return octave errors; naive FFT peak-picking fails on low notes (a developer example reports the detector returning a harmonic an octave off). [S] — [Wolfram PitchRecognize docs](https://reference.wolfram.com/language/ref/PitchRecognize?view=all); [developer write-up](https://dev.to/sendotltd/why-your-web-audio-tuner-sucks-at-low-notes-and-what-to-use-instead-of-fft-391h)
- **Algorithm choice.** A comparison of YIN, pYIN, YAAPT and CREPE found them close in accuracy overall. [A] — [arXiv 2206.14357](https://arxiv.org/pdf/2206.14357)
- **Research practice.** SSAP range finding and scoring use YIN; Mauch et al. used a YIN-based tracker and note medians. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf); [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Browser audio processing.** Guidance for music is to set echoCancellation, noiseSuppression and autoGainControl to false. Chrome applies auto gain control by default and may not honour autoGainControl: false unless echoCancellation is also off. A WebKit bug reports that Safari still low-pass filters audio with echoCancellation disabled. Behaviour varies by browser and device. [S] — [Addpipe constraints guide](https://blog.addpipe.com/audio-constraints-getusermedia/); [WebKit bug 192932](https://bugs.webkit.org/show_bug.cgi?id=192932); [Chromium discussion on music practice](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/WHcn3TmFZAc)
- **Targets must sit in the singer's own range and octave.** SSAP places all targets within a fifth around the measured comfort pitch and uses a model voice of the singer's own sex; research scoring referenced male pitches to C3 and female to C4. Inexperienced singers match a voice-like timbre better than a piano. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf); [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Warm-up effects are larger in the low range.** [A] — [J Voice warm-up acoustic study](https://read.qxmd.com/read/15907439/evaluating-the-influence-of-warmup-on-singing-voice-quality-using-acoustic-measures)
- **Baritone was the commonest voice type in one research sample.** In Mauch et al.'s sample 13 of 24 singers were baritones, so the published 19-cent note-error figure does include low male voices. [P] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)

### Inferences
- Arithmetic that drives the design: C2 = 65.4 Hz has a 15.3 ms period, so a detector needs at least about 31 ms of signal (two periods; roughly 1,470 samples at 48 kHz) and realistically a 2048-sample window. At E2 (82.4 Hz) a 50-cent error is only 2.4 Hz, whereas a 2048-point FFT at 48 kHz has 23 Hz bins, so spectrum-peak methods cannot score low notes; time-domain autocorrelation with interpolation is required.
- Long windows mean slower response: expect about 40–60 ms of latency on low notes, and discard the first frames of each note rather than scoring them.
- Octave-error guards: constrain the search band to the user's measured range plus a margin, apply a continuity rule (reject frame-to-frame jumps near 1200 cents), and score against the target in the octave nearest to the sung pitch while flagging true octave displacement separately. An untrained low-voiced man asked to match a mid-range piano note will often sing it an octave down, which should not be scored as a 1200-cent miss.
- Laptop microphones and small speakers are weak below about 100–150 Hz. Periodicity-based trackers can still recover the fundamental from the spacing of harmonics, but reference tones for low notes played on laptop speakers may be barely audible; use a harmonically rich (voice-like) reference tone and recommend headphones for benchmarks.
- Verify effective settings at runtime with track.getSettings() and show a one-time "mic check" that confirms a sustained hum is tracked steadily at his lowest comfortable note.

### Gaps
- No benchmark of browser pitch detection specifically on bass/baritone voices was found; the low-frequency guidance combines library documentation with arithmetic.
- I could not confirm from a primary source the common rule that the analysis window must span at least two periods of the lowest frequency; it is standard for autocorrelation methods but uncited here.
- No measured data on laptop-mic low-frequency roll-off were retrieved.

## 7. What does habit-formation research say, and how should it shape a daily singing tool?

### Takeaway
Habits form through repetition in a stable context and take about two months at the median, with very wide individual variation (18 to 254+ days); missing a single day does not derail the process. If-then plans tied to an existing routine reliably help (bias-corrected d ≈ 0.15–0.35), and event-based cues build automaticity better than timed reminders.

### Cited Findings
- **Time to automaticity (Moderate).** Lally et al. (2010): 96 volunteers repeated a self-chosen daily behaviour for 84 days; time to reach 95% of asymptotic automaticity had a median of 66 days, range 18 to 254 days. Missing one opportunity did not significantly affect the process, but very inconsistent performers did not form habits. [S, university and society summaries] — [UCL news summary](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit); [BPS Research Digest](https://bps.org.uk/research-digest/how-form-habit)
- **Caveats on the 66-day figure.** It is a median from the 39 participants whose data fit the model, and automaticity was self-reported. [S] — [The Behavioral Scientist](https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit)
- **2024 systematic review (Moderate).** 20 studies, 2,601 participants: median time to habit 59–66 days, means 106–154 days, individual range 4–335 days; pooled pre-post habit-strength change SMD 0.69 (95% CI 0.49–0.88). Determinants of stronger habits: higher frequency, morning timing, self-selected (rather than assigned) behaviours, enjoyment, a stable context, and preparatory planning. Simple behaviours showed larger effects than complex ones. 11 of 20 studies were at high risk of bias. [P via PMC] — [Singh et al. 2024, Healthcare](https://pmc.ncbi.nlm.nih.gov/articles/PMC11641623/)
- **Implementation intentions (Strong, effect size revised down).** Gollwitzer & Sheeran (2006): 94 tests, d = .65 on goal attainment. A later 642-test meta-analysis gives d = 0.36 overall and 0.27 for behaviour, with bias-corrected estimates of 0.15–0.35. [A/S] — [Konstanz repository](https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f); [The Behavioral Scientist glossary](https://www.thebehavioralscientist.com/glossary/implementation-intentions)
- **Cues vs reminders in apps (Moderate).** A 4-week study plus a review of 115 habit apps: reminders supported repetition but hindered habit development (dependence on the reminder), event-based cues increased automaticity, and positive reinforcement had little effect. Existing apps over-rely on self-tracking and reminders. [A] — [Stawarz, Cox & Blandford 2015, CHI](https://discovery.ucl.ac.uk/id/eprint/1468224/)
- **Fogg Behavior Model (Weak as evidence, useful as a design lens).** Behaviour occurs when motivation, ability and a prompt coincide (B = MAP); Tiny Habits shrinks the behaviour until ability is trivially high and anchors it to an existing routine. The model has rarely been tested formally. [S] — [Stanford Behavior Design Lab](https://behaviordesign.stanford.edu/resources/fogg-behavior-model); [The Decision Lab](https://thedecisionlab.com/reference-guide/psychology/fogg-behavior-model)
- **Friction (Weak, popular-press data).** Location data cited by Wendy Wood: people travelling a median 3.7 miles to a gym went five or more times a month, those travelling about 5.1 miles went about once. [S] — [Good Habits, Bad Habits reading guide](https://cdn.nextbigideaclub.com/wp-content/uploads/23134643/Good_habits-reading-guide-FINAL.pdf); [USC Dornsife](https://dornsife.usc.edu/news/?p=3006)

### Inferences
- Onboarding should capture one if-then plan in the user's own words ("After I [existing daily event], I open the app and sing the warm-up") and a fixed place. Display that anchor on the home screen. An event anchor is preferable to a clock alarm; if a notification is used, treat it as a backup and fade it once the routine holds.
- Define the daily unit as a 2–5 minute minimum session that always counts, with 30–60 minutes as the intended full session. The habit literature is about the cue-to-start link, so protecting the start on low-motivation days matters more than session length.
- Set expectations explicitly: "expect this to feel effortful for about two to three months; a missed day does not reset anything." A 66-day or 10-week first horizon is defensible.
- Morning practice is associated with stronger habits, but a low voice is typically less flexible straight after waking; the anchor should be the user's choice, which the evidence also favours.

### Gaps
- No habit-formation study on daily music or singing practice was found; all timelines come from health behaviours.
- Lally's primary paper was not read directly; figures come from the UCL summary and the 2024 review.

## 8. Streaks, goals, progress bars, levels and other gamification: what works long-term and what backfires?

### Takeaway
Streaks demonstrably increase return visits, and gamification has small positive average effects on learning (g ≈ 0.25–0.49), but the same mechanics backfire in predictable ways: a broken streak depresses engagement, reward-heavy systems erode intrinsic motivation over a semester, and bolt-on mechanics unrelated to the core task do nothing. Forgiving, repairable streaks and competence feedback are the durable parts.

### Cited Findings
- **Duolingo streak data (Weak: company self-report, mostly correlational).** Learners reaching a 7-day streak are 3.6× more likely to complete their course (correlational). Allowing two streak freezes at once raised daily active learners by 0.38% without increasing days off. A streak-milestone animation raised 7-day retention of new learners by 1.7%. Duolingo also acknowledges that losing a streak lowers motivation and that learners may avoid challenges to protect one. [P] — [Duolingo blog, 2024](https://blog.duolingo.com/duolingo-streak-research/)
- **Duolingo growth retrospective (Weak: practitioner account).** Retention of existing daily users (CURR) was the lever with about 5× the impact of any other on daily actives. The streak-saver notification was the first big win, followed by calendar view, animations, freezes and streak rewards. Leaderboards raised learning time 17%. A "moves counter" borrowed from a puzzle game took two months to build and had no effect because it did not fit the task ("a boring, tacked-on nuisance"). The author notes the streak-retention link is partly selection bias, and warns to "protect the channel" on notifications. [P] — [Mazal, Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)
- **Broken streaks demotivate (Moderate).** Seven studies: when a behavioural log highlights an intact streak, people engage more than when it highlights a broken one, independent of actual past behaviour; the effect is larger when people blame themselves for the break and smaller when the streak can be repaired. In one study about 66% continued with an intact streak vs 58% with a broken one. [A/S] — [Silverman & Barasch 2023, J. Consumer Research (summary)](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions); [Psychology Today](https://www.psychologytoday.com/us/blog/ulterior-motives/202306/how-broken-streaks-sap-motivation)
- **Slack built into goals helps (Moderate, one failed replication).** Goals with "emergency reserves" (for example 7 days a week with 2 skip days) are preferred and produce more persistence than easy goals (5 days) or rigid hard goals (7 days, no skips); after a failure, reserve-framed goals preserve perceived progress. A student-thesis replication in dieting found no advantage. [S/A] — [UCLA Anderson Review](https://anderson-review.ucla.edu/emergency-reserves/); [Sharif & Shu 2021 follow-up](https://econpapers.repec.org/RePEc:eee:jobhdp:v:163:y:2021:i:c:p:17-29)
- **Gamification meta-analysis (Moderate).** Sailer & Homner (2020): small positive effects on cognitive (g = .49), motivational (g = .36) and behavioural (g = .25) learning outcomes; only the cognitive effect was stable in high-rigour studies; game fiction and social interaction moderated behavioural effects. [A] — [Educational Psychology Review, repository copy](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056)
- **Long-run backfire (Weak-to-Moderate: one 16-week study, n = 71).** Students in a gamified course (badges, leaderboard) showed declining motivation, satisfaction and empowerment over time and lower final exam scores, mediated by intrinsic motivation. [A] — [Hanus & Fox 2015, Computers & Education](https://dblp.org/rec/journals/ce/HanusF15)
- **Overjustification (Strong).** Meta-analysis of 128 experiments: engagement-contingent, completion-contingent and performance-contingent tangible rewards reduced free-choice intrinsic motivation (d = −0.40, −0.36, −0.28), while positive feedback increased it (d = 0.33 for free-choice behaviour). [A] — [Deci, Koestner & Ryan 1999, Psychological Bulletin](https://pubmed.ncbi.nlm.nih.gov/10589297/)
- **Base rate for app abandonment.** Across 93 mental-health apps, median 30-day retention was about 3.3% (tracker apps 6.1%). [A/S] — [Baumel et al. 2019, JMIR](https://www.jmir.org/2019/9/e14567); [Mental Elf summary](https://www.nationalelfservice.net/mental-health/digital-mental-health-tool-ignore-trial-read-analytics/)

### Inferences
- For a single motivated user, the transferable parts of streak design are: (1) a visible run of practice days, (2) built-in slack (for example "5 of 7 days keeps the week", or two automatic freezes), (3) repair after a miss, and (4) neutral wording that attributes a miss to circumstances. Loss-framed pressure and guilt notifications are retention tactics that the evidence links to avoidance of challenge.
- A weekly-consistency measure ("practised 6 of the last 7 days") or a calendar heat-map carries the same information as a streak without a single cliff edge, and matches Lally's finding that one missed day does not matter.
- Points, coins, badges for attendance and leaderboards are the mechanics most associated with undermining; they are also pointless in a single-user tool. Mechanics that express real competence (level = hardest exercise passed at ≥ 90%, range reached, cents trend) function as informational feedback, which the reward meta-analysis shows is motivating.
- The moves-counter failure generalises: any game layer must be the singing itself (hit the note, hold the note), not a wrapper around it.

### Gaps
- No peer-reviewed, independent experiment isolating streak freezes or streak length on long-term learning was found; Duolingo's numbers measure retention, not skill.
- No long-term (> 1 year) gamification study in music practice was found.
- I did not read Sailer & Homner or Silverman & Barasch in full; figures are from abstracts and summaries.

## 9. Self-Determination Theory, music-practice motivation and dropout: why beginners quit and what keeps them going

### Takeaway
People stop making music when competence, relatedness and autonomy feel thwarted; in the best longitudinal data, falling relatedness and a growing sense of incompetence were the clearest markers, and low early practice predicted early quitting. Visible competence gains, self-chosen repertoire and a routine that fits adult life are the protective factors with support.

### Cited Findings
- **Needs and quitting (Moderate).** In a 10-year follow-up of children who began instruments (157 starters; 52% had stopped within 5 years), those who had quit reported lower need satisfaction in the period before quitting than when most engaged: multivariate effect p = .017 (24.4% of variance); relatedness F = 7.20, p = .009; "unrelatedness" F = 10.02, p = .002; "incompetence" p = .049; competence p = .072; autonomy not significant (p = .646). Open-ended reasons mapped onto thwarted needs. [P] — [Evans, McPherson & Davidson 2013, Psychology of Music](https://selfdeterminationtheory.org/wp-content/uploads/2021/06/2013_EvansMcPhersonDavidson_Roleof.pdf)
- **Early practice and strategy.** Students who quit within nine months had practised considerably less; cognitive strategy use predicted success better than accumulated practice time; realistic expectations about required practice mattered. [P, as cited in] — [Evans et al. 2013](https://selfdeterminationtheory.org/wp-content/uploads/2021/06/2013_EvansMcPhersonDavidson_Roleof.pdf)
- **Choice of repertoire (Weak: single case study).** A student practising a self-chosen piece spent more time on it, persisted through difficulty and used more advanced strategies (silent fingering, singing, thinking) than on teacher-assigned pieces. [A] — [Renwick & McPherson, listed abstract](https://www.bohrium.com/scholar/29826126/James_M._Renwick)
- **Adult amateurs.** Adult band members described regular, regimented practice as "a regrettable, incompatible match with their adult lifestyles"; adults who felt disheartened and overburdened reported lower perceived ability and enjoyment and withdrew. [A, review quoting Kruse 2009] — [Cambridge Core reader](https://www.cambridge.org/core/product/5971CBA5156F0C285567025CC23ACBCB/core-reader); [Pitts, "Not playing any more"](https://eprints.whiterose.ac.uk/92600/3/Not%20playing%20anymore.pdf)
- **Singing skill follows engagement, not age.** Accuracy rises through school music and falls back once people stop singing; choir participants outscore non-participants by about 10 points; even 20 minutes of feedback training improves poor-pitch adults. [P/A] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf); [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf); [Berglin et al. 2022](https://researchconnect.buffalo.edu/en/publications/the-effect-of-visual-and-auditory-feedback-on-adult-poor-pitch-re/)
- **Self-selection and enjoyment strengthen habits.** [P via PMC] — [Singh et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11641623/)
- **Skill, not only confidence.** The Guildhall "Finding a Voice" project argues that adult non-singers need actual skill development, and that large-group, learn-by-ear formats do not suit them. [S, project page] — [Guildhall School](https://www.gsmd.ac.uk/research-engagement-services/research/externally-funded-research/finding-voice)

### Inferences
- **Competence:** show improvement early and concretely (first-week before/after on single-pitch hit rate, where gains are fastest), and keep a permanent record of "firsts" (first note matched, first pattern at 90%).
- **Autonomy:** let him pick the songs he works towards and the anchor time; offer the day's plan as a default he can reorder or swap, with a short rationale for each exercise.
- **Real songs early:** the dropout evidence (competence plus enjoyment) and SSAP's finding that song singing is a distinct, valued outcome support putting a short phrase of a chosen song in every session from week one, transposed into his range, rather than deferring songs until exercises are mastered.
- **Relatedness** is the need a solo tool serves least. Optional, low-stakes sharing (exporting a before/after clip for one trusted person) is the realistic substitute; forcing social features is unnecessary.
- Fit to adult life: the 30–60 minute intention should be splittable into blocks, and a short session must count fully.

### Gaps
- The widely repeated claim that about 90% of new guitar players quit within a year (attributed to Fender) could not be traced to a primary source.
- No quantitative dropout study of adult self-taught singers or singing-app users was found. Susan Hallam's work on practice and motivation was identified but not retrieved.
- Evidence for "play real songs early" in adults is indirect.

## 10. Deliberate practice and desirable difficulty: implications for automatic difficulty adjustment

### Takeaway
The "85% rule" is a mathematical result for gradient-descent learners on binary classification (optimal error rate 15.87%), not an empirical law of human skill learning, but it agrees with the challenge-point view in motor learning: difficulty should track current skill so that success is frequent but not guaranteed. Singing research supplies a ready-made difficulty ladder.

### Cited Findings
- **The 85% rule (Strong as theory, Weak as direct human evidence).** For stochastic gradient-descent learning on binary classification with Gaussian noise, the optimal training error rate is about 15.87% (accuracy about 85%); training at that rate is exponentially faster than at fixed difficulty. Other noise assumptions shift the optimum (about 82% accuracy for Laplacian, 75% for Cauchy). Tested on a perceptron, a two-layer network on MNIST, and a model of monkey perceptual learning. The authors link it to "flow" and to the Region of Proximal Learning (building on Vygotsky), but state it still needs extending to multi-choice tasks and that the engagement link is untested. [P via PMC] — [Wilson, Shenhav, Straccia & Cohen 2019, Nature Communications](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/)
- **Author's own scope caveat.** Wilson said the rule strictly applies to binary tasks with clear right/wrong answers and most plausibly to perceptual learning. [S] — [University of Arizona news](https://news.arizona.edu/news/learning-optimized-when-we-fail-15-time)
- **Challenge point framework (Moderate).** The optimal difficulty depends on the learner's skill level and rises as skill rises; harder practice can depress performance during practice while improving long-term learning. [A/S] — [Guadagnoli & Lee 2004, record](https://experts.mcmaster.ca/scholarly-works/1313883); [overview](https://en.wikipedia.org/wiki/Challenge_point_framework)
- **Empirical difficulty ordering in singing.** For the same untrained adults, ±50-cent error rates were 26% for single pitches, 40% for intervals and 54% for four-note patterns. [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Other difficulty levers.** Voice-matched timbre is easier than piano; a neutral syllable is easier than lyrics; targets within a fifth of the comfort pitch avoid register problems. [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf); [Berkowska & Dalla Bella 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3799299)
- **Tempo.** Interval errors decreased significantly when the same occasional singers sang more slowly (Dalla Bella et al. 2007). [P, as cited in] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Continuous reference tone vs echo.** Studies differ in whether the target keeps sounding while the participant sings (Hutchins & Peretz) or is heard once and echoed back with no further feedback (SSAP-style tasks); the authors flag this as a reason scores are not comparable across studies. [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)
- **Feedback-training gains were clearest on four-note melodies** rather than single pitches. [A] — [Berglin et al. 2022](https://researchconnect.buffalo.edu/en/publications/the-effect-of-visual-and-auditory-feedback-on-adult-poor-pitch-re/)

### Inferences
- A workable adaptive rule: keep first-attempt success on the current exercise in roughly the 75–90% band over the last 20–30 notes. Above about 90%, step difficulty up one notch; below about 70%, step down. The band is deliberately wide because the 85% figure is not established for motor skills and beginners' confidence matters.
- Difficulty ladder, one dimension at a time: tolerance (±100 → ±50 → ±35 → ±25 cents); material (single note → two-note interval → four-note pattern → phrase → song section); interval size (steps → thirds → fifths → octave); distance from comfort pitch (within a fifth → within an octave → range edges); reference support (sustained guide tone while singing → tone then silence → piano timbre → no reference); syllable (neutral → lyrics); tempo (slow → song tempo).
- Because single-test hit rates are noisy (section 4), promote on a rolling window rather than on one good run, and never demote mid-session more than one notch.
- The benchmark must stay fixed while exercises adapt; otherwise rising difficulty hides progress.

### Gaps
- No experiment was found testing a target success rate for singing or pitch-matching training in humans.
- Guadagnoli & Lee (2004) was not read in full; Csikszentmihalyi's flow work was not separately sourced.
- Bjork's "desirable difficulties" literature (spacing, interleaving, reduced feedback) was not retrieved in this pass and is a known omission.

## 11. Which friction points kill practice sessions, and which design patterns remove them?

### Takeaway
Direct experimental evidence on friction in music-practice apps is thin; what exists says most apps lose nearly all users within a month, that context-anchored starts beat reminders, that added steps unrelated to the core task do nothing, and that technical capture problems are common. The practical target is one tap from opening the app to the first sung note.

### Cited Findings
- **Abandonment is the default.** Median 30-day retention across 93 mental-health apps about 3.3%; 15-day about 3.9%. [A/S] — [Baumel et al. 2019, JMIR](https://www.jmir.org/2019/9/e14567)
- **Stable context and planned specifics strengthen habits.** [P via PMC] — [Singh et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11641623/)
- **If-then planning removes in-the-moment decisions.** [A] — [Gollwitzer & Sheeran 2006](https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f)
- **Reminders alone create dependence; event cues do not.** [A] — [Stawarz et al. 2015](https://discovery.ucl.ac.uk/id/eprint/1468224/)
- **Small frictions change behaviour frequency.** [S] — [Wood, reading guide](https://cdn.nextbigideaclub.com/wp-content/uploads/23134643/Good_habits-reading-guide-FINAL.pdf)
- **Features that add effort without fitting the task fail; notification over-use burns the channel permanently.** [P] — [Mazal, Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)
- **Audio capture is a real failure point.** 16% of online singing-test recordings were unusable for song scoring; browser audio processing behaves inconsistently across browsers. [P/S] — [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf); [Addpipe constraints guide](https://blog.addpipe.com/audio-constraints-getusermedia/)
- **Range mismatch causes failure that is not the singer's fault.** SSAP exists partly to ensure errors "are not a result of being asked to sing outside of a comfortable range". [P] — [Demorest et al. 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest_etal_2015_MP.pdf)
- **Non-singers are embarrassed and avoid group and by-ear formats.** [S/A] — [Guildhall "Finding a Voice"](https://www.gsmd.ac.uk/research-engagement-services/research/externally-funded-research/finding-voice); [Knight 2010](https://discovery-pp.ucl.ac.uk/id/eprint/10006515/1/knight2010.pdf)

### Inferences
- Friction points and matching patterns (design reasoning from the evidence above, not tested findings):

| Friction point | Design pattern |
|---|---|
| "What should I practise?" | Auto-generated daily plan shown on launch; one "Start" button; the first exercise is always the same easy warm-up |
| Losing place | Resume exactly where the last session stopped; plan state persisted locally |
| Session feels too big | Default short session (5–10 min) with an "extend" prompt at the end; 30–60 min reached by chaining blocks |
| Mic permission and setup | Ask once during onboarding with an explanation; persistent permission (installed PWA, HTTPS); automatic mic check at session start with a clear fix-it message |
| Bad audio producing wrong scores | Disable browser audio processing; noise-floor check; mark low-confidence notes as "not scored" rather than "wrong" |
| Exercises out of range | Every exercise transposed to the measured comfort range; re-check range monthly |
| Being overheard | "Quiet mode" plan (humming, lip trills, soft sirens, listening and pitch-discrimination tasks); headphones optional but supported |
| Long onboarding | Under two minutes: speaking-pitch range check, one anchor plan, first note sung |
| Unclear next step | End-of-session screen shows one sentence of what improved and what tomorrow starts with |
| Connectivity | Offline-capable PWA with local storage of recordings and metrics |
| Notification fatigue | At most one optional daily cue tied to the chosen anchor; never guilt-framed |

### Gaps
- No controlled studies were found on decision fatigue, onboarding length, mic-permission prompts, PWA/offline access or "resume where you left off" in music or language practice apps; these are standard product-design practice with indirect support only.
- No research was found on fear of being overheard as a barrier to home singing practice specifically.

## 12. Reducing singing anxiety, the shock of the recorded voice, and building confidence

### Takeaway
Self-described non-singers are common (about 17% of UK adults call themselves "tone deaf"), usually believe the condition is permanent, and usually sing better than they predict; the measurable problem is vocal-motor control, which improves with practice. Dislike of one's recorded voice is a normal expectation mismatch that weakens with familiarity.

### Cited Findings
- **Prevalence and beliefs.** Around 17% of the UK population self-define as "tone deaf", and many more as "non-singers". People who identify as tone deaf often believe it is congenital and permanent. [S/A] — [Guildhall "Finding a Voice"](https://www.gsmd.ac.uk/research-engagement-services/research/externally-funded-research/finding-voice); [JRME 2024](https://journals.sagepub.com/doi/10.1177/00224294241247578)
- **Embarrassment is central, and self-assessment is too harsh.** Adult non-singers' negative self-image centred on embarrassment and a sense of general musical inadequacy, yet their assessed singing exceeded their self-predicted ratings. [A] — [Knight 2010](https://discovery-pp.ucl.ac.uk/id/eprint/10006515/1/knight2010.pdf)
- **Most people are not perceptually impaired.** In the 632-person online sample every participant had a pitch-discrimination threshold under 100 cents, and the modal tendency, independent of training, was toward accurate singing. [P] — [Pfordresher & Demorest 2021](https://ubwp.buffalo.edu/apal-pfordresher/wp-content/uploads/sites/79/2022/01/PfordresherDemorest_2021_JRME.pdf)
- **The limiting factor is motor control, which is trainable.** Non-musicians: 97% accurate with a slider vs 59% singing. [S] — [BRAMS summary of Hutchins & Peretz](https://brams.org/2012/02/07/a-frog-in-your-throat-or-in-your-ear/). Twenty minutes of visual-feedback training produced significant gains, which the authors read as evidence that singing is a learned skill rather than only an inherited talent. [A] — [Berglin et al. 2022](https://researchconnect.buffalo.edu/en/publications/the-effect-of-visual-and-auditory-feedback-on-adult-poor-pitch-re/)
- **Confidence alone is not enough.** Supportive opportunities improve non-singers' self-image, but skill development has to accompany it. [S] — [Guildhall "Finding a Voice"](https://www.gsmd.ac.uk/research-engagement-services/research/externally-funded-research/finding-voice)
- **Voice confrontation.** A recording lacks the bone-conducted low frequencies heard while speaking, so one's recorded voice sounds higher and thinner than expected; the discomfort is tied to the mismatch with self-image. When people rated voices without recognising their own, they rated their own as more attractive, and familiarity increases liking. [S, popular-science summaries] — [Neuroscience News](https://neurosciencenews.com/hate-voice-sound-18463/); [KCRW](https://www.kcrw.com/culture/articles/why-we-hate-hearing-recordings-of-our-own-voice)
- **Listeners are generous with voices.** Tuning errors in the voice are often not noticed until about 50 cents. [A] — [Hutchins et al. 2014](https://link.springer.com/10.3758/s13414-014-0732-1)

### Inferences
- State the facts up front in onboarding: most adults who think they cannot sing can hear pitch normally; untrained adults typically hit 55–75% of notes; the gap closes with practice; even professionals vary by 20–35 cents. This directly counters the "permanent" belief.
- Stage exposure to his own voice: first sessions show only the pitch trace (no playback); then short playback of single notes; then phrases; then the weekly song recording. Include a one-line explanation of why recordings sound unfamiliar. A deep-voiced user will notice the missing low end most.
- Privacy as a feature: recordings stored locally, nothing shared by default, and a quiet-mode plan for when others are home.
- Avoid a public-facing or comparative score in early weeks; show personal trend only.

### Gaps
- No trial of interventions for singing-specific self-consciousness in solitary practice was found; graded exposure is an inference from general principles.
- The voice-confrontation studies (Holzman & Rousey; Hughes) were reached only through popular summaries.
- Abril (2007) on singing and social anxiety was identified but not retrieved.

## 13. Feedback framing for beginners: relative vs absolute, immediate vs summary, growth framing

### Takeaway
Feedback helps on average (d ≈ 0.41) but more than a third of feedback interventions reduce performance, chiefly when they pull attention to the self rather than the task. For motor skills, feedback after good attempts and learner autonomy improve retention; real-time visual pitch feedback helps beginners in short sessions but has not shown lasting superiority over practice alone. Growth-mindset messaging by itself has small effects.

### Cited Findings
- **Feedback can hurt (Strong).** Meta-analysis of 607 effect sizes (23,663 observations): feedback interventions improved performance on average (d = .41), but over one third decreased it. Feedback Intervention Theory: effectiveness falls as feedback shifts attention from the task toward the self. [A] — [Kluger & DeNisi 1996, Psychological Bulletin](https://cris.huji.ac.il/en/publications/the-effects-of-feedback-interventions-on-performance-a-historical/)
- **Feedback after good trials (Moderate).** Learners given results on their three best trials per block retained the skill better on a delayed no-feedback test than those given results on their three worst, with no difference during practice; interpreted as a motivational effect. Learners who control feedback tend to request it after good trials. [A] — [Chiviacowsky & Wulf 2007](https://informahealthcare.com/doi/abs/10.1080/02701367.2007.10599402)
- **OPTIMAL theory (Moderate).** Motor learning is enhanced by raising expectancies of success, supporting autonomy, and directing attention externally (to the effect, not the body); a randomised dart-throwing study found better retention with enhanced expectancies plus autonomy support. [A] — [Wulf & Lewthwaite 2016](https://link.springer.com/10.3758/s13423-015-0999-9); [2019 RCT](https://www.pubmed.gov/30654726/)
- **Positive competence feedback raises intrinsic motivation** (d = 0.33), whereas tangible rewards lower it. [A] — [Deci, Koestner & Ryan 1999](https://pubmed.ncbi.nlm.nih.gov/10589297/)
- **Real-time visual pitch feedback, mixed (Moderate).** For: only the visual-feedback group showed a significant training effect in adult poor-pitch singers after 20 minutes, especially on four-note melodies. [A] — [Berglin et al. 2022](https://researchconnect.buffalo.edu/en/publications/the-effect-of-visual-and-auditory-feedback-on-adult-poor-pitch-re/). For: a 2006 thesis across skill levels concluded visual feedback improves pitch accuracy. [A] — [Wilson 2006, University of Sydney](https://ses.library.usyd.edu.au/handle/2123/1526). Against: in a 10-week study of adult non-musicians both groups improved and the concurrent-feedback group was not better than practice without it. [A] — [Paney & Tharp, via scite](https://scite.ai/authors/kevin-tharp-11lEWX). Against: a 2016 thesis found no effect of real-time visual feedback or training length on vocal control. [A] — [Wilfrid Laurier thesis](https://scholars.wlu.ca/etd/1812)
- **Self-judgment needs external information.** Singers cannot reliably judge their own intonation while singing. [P, as cited in] — [Mauch et al. 2014](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/JASA_136_1_401_1.pdf)
- **Growth-mindset interventions (Strong, small effect).** Meta-analysis (k = 43, N = 57,155): the overall effect of growth-mindset interventions on achievement was small. [A] — [Sisk et al. 2018, Psychological Science](https://hhs.purdue.edu/skill-learning-and-performance-lab/wp-content/uploads/sites/43/2024/08/sisk-et-al-2018-to-what-extent-and-under-which-circumstances-are-growth-mind-sets-important-to-academic-achievement-two.pdf)
- **Singing is demonstrably learnable**, which is the factual basis for any growth framing. [P] — [Demorest & Pfordresher 2015](https://www.acsu.buffalo.edu/~pqp/pdfs/Demorest&Pfordresher_2015_MP.pdf)

### Inferences
- Frame every number against the user's own past ("12 cents closer than four weeks ago", "personal best on patterns") rather than against population norms or grades. This keeps attention on the task and its trajectory, the condition under which feedback helps.
- Lead summaries with what went well (best notes, biggest gain), then give one specific, task-level correction ("your starts are 40 cents flat; aim slightly higher on the first note"). Avoid evaluative labels about the person ("poor", "tone deaf", letter grades).
- Use external-focus cues tied to the display ("move the line up to the band") instead of body-focused instructions where possible.
- Combine feedback modes: live pitch trace during early learning of an exercise, then trials with the display hidden and feedback only after the note, to avoid dependence on the screen. The mixed 10-week result and classic guidance-effect reasoning both point to fading concurrent feedback as skill grows.
- Let the user choose when to see detail (tap to expand per-note results) to support autonomy.
- Growth framing should be delivered as evidence (his own trend, the "use it or lose it" data) rather than as slogans, given the small effects of mindset messaging alone.

### Gaps
- No study was found directly comparing improvement-relative with absolute scoring for persistence in music learners.
- No singing-specific study on immediate vs delayed/summary feedback and long-term retention was found; the guidance hypothesis literature (Salmoni, Schmidt & Walter 1984) was not retrieved, so the fading recommendation is an inference.
- Kluger & DeNisi's moderator results (for example velocity feedback vs normative comparison) were not checked in the full paper.

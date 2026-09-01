import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const outputFile = path.resolve('assets/data/medtech-index.json')

const rows = []

function add(lineage, names, options = {}) {
  const {
    body = [],
    types = [],
    tags = [],
    parent = null,
    parents = parent ? [parent] : [],
  } = options

  for (const name of names) {
    rows.push({ name, lineage, body, types, tags, parents })
  }
}

add(['Foundational biomedical sciences'], [
  'Anatomy and morphology', 'Physiology', 'Biochemistry and molecular biology', 'Cell biology',
  'Developmental biology and embryology', 'Genetics and genomics', 'Epigenetics', 'Microbiology',
  'Virology', 'Mycology', 'Parasitology', 'Immunology', 'Pathology and pathophysiology',
  'Pharmacology', 'Toxicology', 'Neuroscience', 'Biophysics and biomechanics', 'Systems biology',
  'Evolutionary medicine',
], { types: ['foundational', 'research'], tags: ['mechanisms', 'basic science'] })

add(['Organ- and system-based medical sciences', 'Nervous and behavioral'], [
  'Neurology', 'Neurological surgery', 'Psychiatry', 'Neuropsychology', 'Neurorehabilitation',
], { body: ['brain', 'spinal cord', 'peripheral nervous system'], types: ['clinical'], tags: ['nervous system'] })
add(['Organ- and system-based medical sciences', 'Nervous and behavioral'], [
  'Child neurology', 'Clinical neurophysiology', 'Epilepsy', 'Neurocritical care',
  'Neurodevelopmental disabilities', 'Neuroendovascular intervention', 'Neuromuscular medicine',
  'Vascular neurology', 'Brain-injury medicine',
], { body: ['brain', 'spinal cord', 'peripheral nervous system'], types: ['clinical', 'subspecialty'], tags: ['nervous system'], parent: 'Neurology' })
add(['Organ- and system-based medical sciences', 'Nervous and behavioral'], ['Sleep medicine'], {
  body: ['brain', 'respiratory system'], types: ['clinical', 'subspecialty'], tags: ['nervous system', 'sleep'], parent: 'Neurology',
})

add(['Organ- and system-based medical sciences', 'Cardiovascular'], ['Cardiology', 'Vascular medicine'], {
  body: ['heart', 'blood vessels'], types: ['clinical'], tags: ['cardiovascular'],
})
add(['Organ- and system-based medical sciences', 'Cardiovascular'], ['Cardiac surgery'], {
  body: ['heart'], types: ['clinical', 'surgical'], tags: ['cardiovascular'], parent: 'Cardiology',
})
add(['Organ- and system-based medical sciences', 'Cardiovascular'], ['Vascular surgery'], {
  body: ['blood vessels'], types: ['clinical', 'surgical'], tags: ['cardiovascular'], parent: 'Vascular medicine',
})

add(['Organ- and system-based medical sciences', 'Respiratory'], ['Pulmonology', 'Respiratory physiology', 'Thoracic surgery'], {
  body: ['lungs', 'airways', 'chest'], types: ['clinical'], tags: ['respiratory'],
})
add(['Organ- and system-based medical sciences', 'Digestive and hepatobiliary'], ['Gastroenterology', 'Hepatology', 'Colorectal surgery'], {
  body: ['gastrointestinal tract', 'liver', 'biliary system'], types: ['clinical'], tags: ['digestive system'],
})
add(['Organ- and system-based medical sciences', 'Renal and urinary'], ['Nephrology', 'Urology'], {
  body: ['kidneys', 'urinary tract'], types: ['clinical'], tags: ['renal and urinary'],
})
add(['Organ- and system-based medical sciences', 'Endocrine and metabolic'], ['Endocrinology', 'Diabetology', 'Metabolic medicine', 'Obesity medicine'], {
  body: ['endocrine glands', 'pancreas', 'whole body'], types: ['clinical'], tags: ['endocrine', 'metabolism'],
})
add(['Organ- and system-based medical sciences', 'Blood and lymphatic'], ['Hematology', 'Transfusion medicine'], {
  body: ['blood', 'bone marrow', 'lymphatic system'], types: ['clinical'], tags: ['blood and lymphatic'],
})
add(['Organ- and system-based medical sciences', 'Immune and connective tissue'], ['Allergy and immunology', 'Rheumatology'], {
  body: ['immune system', 'connective tissue', 'joints'], types: ['clinical'], tags: ['immune system'],
})
add(['Organ- and system-based medical sciences', 'Musculoskeletal'], ['Orthopedics', 'Sports medicine', 'Physical medicine and rehabilitation'], {
  body: ['bones', 'joints', 'muscles', 'connective tissue'], types: ['clinical'], tags: ['musculoskeletal', 'functioning'],
})
add(['Organ- and system-based medical sciences', 'Skin'], ['Dermatology'], {
  body: ['skin', 'hair', 'nails'], types: ['clinical'], tags: ['integumentary system'],
})
add(['Organ- and system-based medical sciences', 'Eye and visual system'], ['Ophthalmology', 'Vision science'], {
  body: ['eyes', 'visual system'], types: ['clinical'], tags: ['sensory system'],
})
add(['Organ- and system-based medical sciences', 'Ear, nose, throat, and head and neck'], ['Otolaryngology', 'Audiology', 'Vestibular medicine'], {
  body: ['ear', 'nose', 'throat', 'head and neck'], types: ['clinical'], tags: ['sensory system'],
})
add(['Organ- and system-based medical sciences', 'Reproductive and maternal'], ['Obstetrics and gynecology', 'Reproductive endocrinology', 'Maternal-fetal medicine'], {
  body: ['reproductive system', 'uterus', 'ovaries', 'placenta'], types: ['clinical'], tags: ['reproduction', 'maternal health'],
})
add(['Organ- and system-based medical sciences', 'Oral and craniofacial'], ['Dentistry', 'Oral surgery', 'Maxillofacial medicine'], {
  body: ['mouth', 'teeth', 'jaw', 'face'], types: ['clinical'], tags: ['oral health'],
})

add(['Cross-organ disease and mechanism domains', 'Cancer'], ['Oncology', 'Cancer biology'], {
  body: ['whole body'], types: ['disease domain', 'research'], tags: ['cancer', 'neoplasia'],
})
add(['Cross-organ disease and mechanism domains', 'Cancer'], ['Medical oncology', 'Surgical oncology', 'Radiation oncology'], {
  body: ['whole body'], types: ['clinical', 'therapeutic'], tags: ['cancer', 'neoplasia'], parent: 'Oncology',
})
add(['Cross-organ disease and mechanism domains', 'Cancer'], [
  'Neuro-oncology', 'Hematologic oncology', 'Thoracic oncology', 'Pediatric oncology', 'Molecular oncology',
  'Cancer immunology', 'Cancer genomics', 'Cancer epidemiology',
], { body: ['whole body'], types: ['disease domain', 'subspecialty'], tags: ['cancer', 'neoplasia'], parent: 'Oncology' })
add(['Cross-organ disease and mechanism domains'], [
  'Infectious diseases', 'Genetic and rare diseases', 'Autoimmune and inflammatory diseases', 'Metabolic diseases',
  'Vascular and thrombotic diseases', 'Degenerative diseases', 'Congenital and developmental disorders',
  'Trauma and injury science', 'Environmental and occupational disease', 'Toxicological disease', 'Pain medicine',
  'Aging, frailty, and geroscience',
], { body: ['whole body'], types: ['disease domain', 'research'], tags: ['cross-organ'] })

add(['Diagnostic and measurement sciences', 'Imaging'], ['Radiology and biomedical imaging'], {
  body: ['whole body'], types: ['diagnostic', 'technology'], tags: ['imaging', 'measurement'],
})
add(['Diagnostic and measurement sciences', 'Imaging'], ['Nuclear medicine'], {
  body: ['whole body'], types: ['diagnostic', 'therapeutic', 'technology'], tags: ['imaging', 'measurement', 'radiopharmaceuticals'],
})
add(['Diagnostic and measurement sciences', 'Imaging'], [
  'Diagnostic radiology', 'Neuroradiology', 'Abdominal radiology', 'Musculoskeletal radiology', 'Pediatric radiology',
  'Nuclear radiology', 'Interventional radiology', 'Breast radiology', 'Thoracic radiology', 'Imaging informatics',
  'Radiomics', 'Computational imaging', 'Radiogenomics',
], { body: ['whole body'], types: ['diagnostic', 'technology', 'subspecialty'], tags: ['imaging', 'measurement'], parent: 'Radiology and biomedical imaging' })
add(['Diagnostic and measurement sciences', 'Imaging technologies'], ['X-ray imaging', 'Computed tomography', 'Magnetic resonance imaging', 'Ultrasound imaging', 'Positron emission tomography', 'Single-photon emission computed tomography'], {
  body: ['whole body'], types: ['diagnostic', 'technology'], tags: ['imaging modality', 'measurement'], parent: 'Radiology and biomedical imaging',
})
add(['Diagnostic and measurement sciences', 'Pathology'], ['Pathology'], {
  body: ['whole body', 'tissue', 'cells'], types: ['diagnostic', 'laboratory'], tags: ['pathology', 'measurement'],
})
add(['Diagnostic and measurement sciences', 'Pathology'], [
  'Anatomic pathology', 'Clinical pathology', 'Molecular pathology', 'Neuropathology', 'Hematopathology',
  'Cytopathology', 'Forensic pathology',
], { body: ['whole body', 'tissue', 'cells'], types: ['diagnostic', 'laboratory', 'subspecialty'], tags: ['pathology', 'measurement'], parent: 'Pathology' })
add(['Diagnostic and measurement sciences', 'Laboratory and physiological measurement'], [
  'Laboratory medicine', 'Molecular diagnostics', 'Clinical chemistry', 'Microbiological diagnostics',
  'Electrodiagnostic medicine', 'Biomarker science', 'Physiological monitoring', 'Medical physics',
], { body: ['whole body'], types: ['diagnostic', 'laboratory'], tags: ['measurement'] })

add(['Therapeutic and interventional sciences'], [
  'Surgery and surgical sciences', 'Anesthesiology', 'Critical care medicine', 'Pharmacotherapy and clinical pharmacology',
  'Immunotherapy', 'Transplantation medicine', 'Regenerative medicine', 'Cell therapy',
  'Gene therapy and genome editing', 'Rehabilitation science', 'Physical therapy', 'Occupational therapy',
  'Palliative and hospice medicine', 'Medical-device therapeutics', 'Behavioral and psychotherapeutic interventions',
], { body: ['whole body'], types: ['therapeutic'], tags: ['intervention', 'treatment'] })

add(['Omics, computational, and engineering sciences', 'Omics'], [
  'Genomics', 'Epigenomics', 'Transcriptomics', 'Proteomics', 'Metabolomics', 'Lipidomics', 'Glycomics',
  'Microbiomics', 'Pharmacogenomics', 'Functional genomics', 'Population genomics', 'Human genomics',
  'Medical genetics and genomics', 'Clinical genomics', 'Comparative genomics', 'Pathogen genomics', 'Rare-disease genomics',
  'Genome engineering', 'Computational genomics', 'Single-cell biology', 'Spatial biology',
], { body: ['whole body', 'cells', 'molecules'], types: ['foundational', 'computational', 'laboratory'], tags: ['omics', 'precision medicine'] })
add(['Omics, computational, and engineering sciences', 'Clinical genetics'], [
  'Clinical biochemical genetics', 'Laboratory genetics and genomics', 'Medical biochemical genetics',
  'Molecular genetic pathology',
], { body: ['whole body', 'cells', 'molecules'], types: ['clinical', 'laboratory', 'subspecialty'], tags: ['omics', 'precision medicine'], parent: 'Medical genetics and genomics' })
add(['Omics, computational, and engineering sciences', 'Computation'], [
  'Bioinformatics', 'Computational biology', 'Biostatistics', 'Clinical informatics', 'Artificial intelligence in medicine',
  'Systems medicine', 'Precision medicine',
], { body: ['whole body'], types: ['computational', 'research'], tags: ['data science', 'precision medicine'] })
add(['Omics, computational, and engineering sciences', 'Engineering'], ['Biomedical engineering', 'Medical robotics', 'Digital health'], {
  body: ['whole body'], types: ['engineering', 'technology'], tags: ['medical technology', 'devices'],
})

add(['Population, prevention, and health-system sciences'], [
  'Epidemiology', 'Public health', 'Preventive medicine', 'Environmental health', 'Occupational health', 'Global health',
  'Social and behavioral medicine', 'Health disparities and social determinants', 'Health-services research',
  'Implementation science', 'Comparative-effectiveness research', 'Outcomes research', 'Health economics',
  'Health policy', 'Quality improvement and patient safety', 'Medical ethics and bioethics', 'Regulatory science',
  'Disaster medicine',
], { body: ['population'], types: ['population', 'research'], tags: ['health systems', 'prevention'] })

add(['Life-stage and care-setting disciplines'], [
  'Neonatology', 'Pediatrics', 'Adolescent medicine', 'Reproductive and maternal medicine', 'Geriatrics', 'Primary care',
  'Family medicine', 'Emergency medicine', 'Hospital medicine', 'Critical care', 'Ambulatory medicine', 'Rural medicine',
  'Military and aerospace medicine', 'Palliative and hospice care',
], { body: ['whole body'], types: ['clinical', 'care setting'], tags: ['life stage', 'care delivery'] })

add(['Translational stage'], [
  'Fundamental discovery', 'Experimental and mechanistic research', 'Preclinical models',
  'Biomarker and diagnostic development', 'Therapeutic development', 'Clinical trials',
  'Clinical epidemiology and comparative effectiveness', 'Implementation in health systems',
  'Population surveillance and policy', 'Post-market and real-world evidence',
], { body: ['whole body'], types: ['translational stage'], tags: ['research pathway'] })

const slugify = (value) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

const nameToId = new Map(rows.map(({ name }) => [name, slugify(name)]))
const children = new Map(rows.map(({ name }) => [nameToId.get(name), []]))

for (const row of rows) {
  for (const parentName of row.parents) {
    const parentId = nameToId.get(parentName)
    if (!parentId) throw new Error(`Unknown parent discipline: ${parentName}`)
    children.get(parentId).push(nameToId.get(row.name))
  }
}

const clinicalTypes = new Set(['clinical', 'subspecialty', 'care setting', 'surgical', 'diagnostic', 'therapeutic', 'laboratory'])
const acgmeUmbrella = new Map([
  ['Cardiology', 'Internal Medicine'], ['Gastroenterology', 'Internal Medicine'], ['Hepatology', 'Internal Medicine'],
  ['Nephrology', 'Internal Medicine'], ['Endocrinology', 'Internal Medicine'], ['Hematology', 'Internal Medicine'],
  ['Medical oncology', 'Internal Medicine'], ['Pulmonology', 'Internal Medicine'], ['Rheumatology', 'Internal Medicine'],
  ['Child neurology', 'Neurology'], ['Epilepsy', 'Neurology'], ['Clinical neurophysiology', 'Neurology'],
  ['Neuroradiology', 'Radiology'], ['Interventional radiology', 'Radiology'], ['Diagnostic radiology', 'Radiology'],
  ['Pediatric radiology', 'Radiology'], ['Nuclear radiology', 'Radiology'], ['Anatomic pathology', 'Pathology'],
  ['Clinical pathology', 'Pathology'], ['Neuropathology', 'Pathology'], ['Hematopathology', 'Pathology'],
  ['Cytopathology', 'Pathology'], ['Molecular pathology', 'Pathology'], ['Neonatology', 'Pediatrics'],
  ['Adolescent medicine', 'Pediatrics'], ['Maternal-fetal medicine', 'Obstetrics and Gynecology'],
  ['Reproductive endocrinology', 'Obstetrics and Gynecology'], ['Vascular surgery', 'Surgery'],
  ['Cardiac surgery', 'Thoracic Surgery'], ['Colorectal surgery', 'Colon and Rectal Surgery'],
])

const acgmeExact = new Map([
  ['Allergy and immunology', 'Allergy and Immunology'], ['Anesthesiology', 'Anesthesiology'],
  ['Dermatology', 'Dermatology'], ['Emergency medicine', 'Emergency Medicine'], ['Family medicine', 'Family Medicine'],
  ['Medical genetics and genomics', 'Medical Genetics and Genomics'], ['Neurological surgery', 'Neurological Surgery'],
  ['Neurology', 'Neurology'], ['Nuclear medicine', 'Nuclear Medicine'],
  ['Obstetrics and gynecology', 'Obstetrics and Gynecology'], ['Ophthalmology', 'Ophthalmology'],
  ['Orthopedics', 'Orthopaedic Surgery'], ['Otolaryngology', 'Otolaryngology – Head and Neck Surgery'],
  ['Pathology', 'Pathology'], ['Pediatrics', 'Pediatrics'],
  ['Physical medicine and rehabilitation', 'Physical Medicine and Rehabilitation'],
  ['Preventive medicine', 'Preventive Medicine'], ['Psychiatry', 'Psychiatry'],
  ['Radiation oncology', 'Radiation Oncology'], ['Urology', 'Urology'],
])

for (const name of ['Clinical biochemical genetics', 'Laboratory genetics and genomics', 'Medical biochemical genetics', 'Molecular genetic pathology']) {
  acgmeUmbrella.set(name, 'Medical Genetics and Genomics')
}

function meshLens(row) {
  if (row.types.includes('disease domain')) return 'Diseases'
  if (row.types.includes('diagnostic') || row.types.includes('therapeutic')) return 'Analytical, Diagnostic and Therapeutic Techniques, and Equipment'
  if (row.types.includes('population') || row.types.includes('care setting')) return 'Health Care'
  if (row.types.includes('computational')) return 'Information Science'
  if (row.types.includes('engineering') || row.types.includes('technology')) return 'Technology, Industry, and Agriculture'
  if (row.tags.includes('nervous system')) return 'Psychiatry and Psychology'
  if (row.types.includes('foundational')) return 'Phenomena and Processes'
  return 'Disciplines and Occupations'
}

function fordLens(row) {
  const first = row.lineage[0]
  if (first === 'Foundational biomedical sciences') return 'Basic medicine'
  if (first === 'Organ- and system-based medical sciences' || first === 'Cross-organ disease and mechanism domains') return 'Clinical medicine'
  if (first === 'Population, prevention, and health-system sciences' || first === 'Life-stage and care-setting disciplines') return 'Health sciences'
  if (first === 'Omics, computational, and engineering sciences' && (row.tags.includes('omics') || row.types.includes('engineering'))) return 'Health biotechnology'
  return 'Other medical sciences'
}

function rcdcLens(row) {
  if (row.tags.includes('cancer')) return 'Cancer'
  if (row.tags.includes('nervous system')) return 'Neurosciences'
  if (row.tags.includes('cardiovascular')) return 'Cardiovascular research'
  if (row.tags.includes('respiratory')) return 'Lung research'
  if (row.tags.includes('immune system')) return 'Autoimmune and inflammatory disease'
  if (row.tags.includes('omics') || row.tags.includes('precision medicine')) return 'Genetics and genomics'
  if (row.types.includes('disease domain')) return 'Research, condition, and disease category'
  if (row.types.includes('population') || row.name.includes('Epidemiology')) return 'Population and prevention research'
  if (row.types.includes('translational stage')) return 'Research area'
  return null
}

function whoLens(row) {
  const lenses = []
  if (row.types.includes('disease domain') || row.tags.includes('cancer')) lenses.push('ICD — diseases and related health problems')
  if (row.types.includes('diagnostic') || row.types.includes('therapeutic') || row.types.includes('surgical')) lenses.push('ICHI — health interventions')
  if (row.tags.includes('functioning') || row.name.includes('Rehabilitation') || row.name.includes('Physical therapy') || row.name.includes('Occupational therapy')) lenses.push('ICF — functioning, disability and health')
  return lenses
}

const index = rows.map((row) => {
  const id = nameToId.get(row.name)
  const childIds = children.get(id)
  const sourceLenses = {
    mesh: [meshLens(row)],
    oecd_ford: [fordLens(row)],
  }

  const acgme = acgmeUmbrella.get(row.name) || acgmeExact.get(row.name)
  if (acgme && row.types.some((type) => clinicalTypes.has(type))) sourceLenses.acgme = [acgme]
  const rcdc = rcdcLens(row)
  if (rcdc) sourceLenses.nih_rcdc = [rcdc]
  const who = whoLens(row)
  if (who.length) sourceLenses.who_fic = who

  return {
    id,
    name: row.name,
    scientific_lineage: row.lineage,
    body_parts: row.body,
    parent_disciplines: row.parents.map((name) => nameToId.get(name)),
    subdisciplines: childIds.map((childId) => rows.find(({ name }) => nameToId.get(name) === childId).name),
    child_disciplines: childIds,
    tags: [...new Set([...row.types, ...row.tags])],
    source_lenses: sourceLenses,
  }
})

const ids = new Set()
for (const entry of index) {
  if (ids.has(entry.id)) throw new Error(`Duplicate discipline id: ${entry.id}`)
  ids.add(entry.id)
}

await mkdir(path.dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`)
console.log(`Wrote ${index.length} MedTech Index records to ${outputFile}`)

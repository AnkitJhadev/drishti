const fs = require('fs')

// ── Minimal single-page PDF writer (no deps) ───────────────────────────────
function esc(s) {
  return s.replace(/[\\()]/g, (c) => '\\' + c)
}

function makePdf(filename, lines) {
  let content = 'BT /F1 11 Tf 50 760 Td 15 TL\n'
  for (const l of lines) content += '(' + esc(l) + ') Tj T*\n'
  content += 'ET'

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'
  })
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
  offsets.forEach((off) => { pdf += String(off).padStart(10, '0') + ' 00000 n \n' })
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF'

  fs.writeFileSync(filename, Buffer.from(pdf, 'latin1'))
  console.log('Wrote ' + filename + ' (' + Buffer.byteLength(pdf, 'latin1') + ' bytes)')
}

// ── Structured complaint reports ───────────────────────────────────────────
// Each MUST include a "Location:" (or "Service Area:") field with a known area
// so ingestion can validate + geocode it.
const reports = [
  {
    file: 'complaint_bandra.pdf',
    lines: [
      'TELECOM CUSTOMER COMPLAINT - FORMAL REPORT',
      '',
      'Date: 07 June 2026',
      'Customer: Rajesh Kumar   Mobile: 98200-11045',
      'Service Area: Bandra West, Mumbai',
      '',
      'Subject: Complete network outage for over 6 hours',
      '',
      'To the Network Operations Team,',
      '',
      'I am writing to report a complete loss of mobile network and',
      'data services in the Bandra West area of Mumbai since early',
      'this morning. There has been absolutely no signal on any device',
      'in my building, and neither calls nor mobile internet are working.',
      '',
      'This is the third such outage in Bandra this month. Several of my',
      'neighbours on Hill Road and near Bandra station report the exact',
      'same total outage. We suspect the local cell tower has failed,',
      'as the signal indicator shows no bars at all.',
      '',
      'This outage is severely affecting work-from-home staff and local',
      'businesses. Hundreds of users in the area appear to be impacted.',
      'Please treat this as a critical, high-priority incident and send',
      'a field engineering team to inspect the Bandra tower immediately.',
      '',
      'Issue type: network outage / tower failure',
      'Severity: critical',
      'Location: Bandra West, Mumbai',
      '',
      'Regards,',
      'Rajesh Kumar',
    ],
  },
  {
    file: 'complaint_whitefield.pdf',
    lines: [
      'TELECOM CUSTOMER COMPLAINT - FORMAL REPORT',
      '',
      'Date: 08 June 2026',
      'Customer: Priya Nair   Mobile: 98450-22099',
      'Service Area: Whitefield, Bengaluru',
      '',
      'Subject: Persistently slow internet for several days',
      '',
      'To the Network Operations Team,',
      '',
      'I am writing to report severely degraded mobile data speeds in',
      'the Whitefield area of Bengaluru over the past three days. Web',
      'pages take very long to load and video calls freeze constantly,',
      'making it impossible to work from home reliably.',
      '',
      'Many residents near the Whitefield tech park report the same',
      'slow speeds, especially during peak evening hours. The signal',
      'shows full bars but throughput is extremely poor, which points',
      'to congestion or a degraded tower in the area.',
      '',
      'Please investigate the Whitefield tower capacity and restore',
      'normal data performance as soon as possible.',
      '',
      'Issue type: slow internet',
      'Severity: high',
      'Location: Whitefield, Bengaluru',
      '',
      'Regards,',
      'Priya Nair',
    ],
  },
  {
    file: 'complaint_delhi.pdf',
    lines: [
      'TELECOM CUSTOMER COMPLAINT - FORMAL REPORT',
      '',
      'Date: 08 June 2026',
      'Customer: Amit Sharma   Mobile: 98110-33077',
      'Service Area: Delhi North',
      '',
      'Subject: Frequent call drops affecting business calls',
      '',
      'To the Network Operations Team,',
      '',
      'I am writing to report repeated call drops across the Delhi North',
      'sector for the last two days. Calls disconnect every couple of',
      'minutes and the voice quality is poor with echo before the drop.',
      '',
      'This is affecting my work calls badly, and colleagues in the same',
      'area report identical problems. The issue appears tied to the',
      'local tower handling the Delhi North sector.',
      '',
      'Please look into the Delhi North tower and resolve the call drop',
      'issue at the earliest.',
      '',
      'Issue type: call drop',
      'Severity: medium',
      'Location: Delhi North',
      '',
      'Regards,',
      'Amit Sharma',
    ],
  },
]

reports.forEach((r) => makePdf(r.file, r.lines))

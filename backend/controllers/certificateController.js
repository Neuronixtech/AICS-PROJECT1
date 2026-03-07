const Student = require('../models/Student')
const Counter = require('../models/Counter')
const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')

const ASSETS = path.join(__dirname, '..', 'assets')
const RES = path.join(ASSETS, 'cert_resources')
const ip = (n) => path.join(RES, n)

// ── Colours (matching original exactly) ──────────────────────────────────────
const GOLD = '#c9960c'
const BLUE = '#1a3a8a'
const RED = '#cc0000'
const DARK = '#111111'
const NAVY = '#1a2a6e'
const GREY = '#555555'

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolvePhotoPath(s) {
  if (s.studentPhoto && s.studentPhoto.fileUrl) {
    const abs = path.join(
      __dirname,
      '..',
      '..',
      s.studentPhoto.fileUrl.replace(/^\//, ''),
    )
    if (fs.existsSync(abs)) return abs
  }
  return null
}
function safeImage(doc, file, x, y, opts) {
  if (file && fs.existsSync(file)) {
    try {
      doc.image(file, x, y, opts)
      return true
    } catch (e) {
      console.error('img', e.message)
    }
  }
  return false
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
function fmtDMY(d) {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}
function hRule(doc, x1, y, x2, w, color) {
  doc.lineWidth(w).strokeColor(color).moveTo(x1, y).lineTo(x2, y).stroke()
}

// ═════════════════════════════════════════════════════════════════════════════
exports.generateCertificate = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).populate(
      'course',
      'name duration subjects',
    )
    if (!student) return res.status(404).json({ message: 'Student not found' })
    if (student.status !== 'active')
      return res.status(400).json({ message: 'Student must be active' })
    if (student.pendingFees > 0)
      return res.status(400).json({
        message: 'Cannot issue certificate with pending fees',
        pendingAmount: student.pendingFees,
      })

    const certsDir = path.join(__dirname, '..', 'certificates')
    if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true })

    let certNum = student.certificateNumber
    if (!certNum) certNum = await Counter.getNextCertificateNumber()

    const fullName = [student.firstName, student.fatherName, student.lastName]
      .filter(Boolean)
      .join(' ')
      .toUpperCase()

    const filePath = path.join(
      certsDir,
      `cert_${student._id}_${Date.now()}.pdf`,
    )

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
    const ws = fs.createWriteStream(filePath)
    doc.pipe(ws)

    const W = 595.28,
      H = 841.89

    // ── 1. WATERMARK ──────────────────────────────────────────────────────────
    doc.save()
    doc.opacity(0.25)
    const wTile = 'Academic Institute of Computer Education Society'
    const wGap = '     ' // spacing between the two columns
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#aaaaaa')
    for (let y = 6; y < H; y += 18)
      doc.text(wTile + wGap + wTile, 25, y, { lineBreak: false })
    doc.restore()

    // ── 2. TRIPLE GOLD BORDER ────────────────────────────────────────────────
    doc
      .lineWidth(5.5)
      .strokeColor(GOLD)
      .rect(3.5, 3.5, W - 7, H - 7)
      .stroke()
    doc
      .lineWidth(1.5)
      .strokeColor(GOLD)
      .rect(9.5, 9.5, W - 19, H - 19)
      .stroke()
    doc
      .lineWidth(0.5)
      .strokeColor(GOLD)
      .rect(13, 13, W - 26, H - 26)
      .stroke()

    // ── 3. TOP INFO BAR ───────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
    doc.text('KSDC Reg.No. : VTP0001709', 18, 16, { lineBreak: false })
    doc.text('NSDC Reg.No. : T.P.134118', 18, 27, { lineBreak: false })

    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(DARK)
    doc.text('AICE Society', 0, 16, {
      width: W,
      align: 'center',
      lineBreak: false,
    })

    // "Regd. By Govt of Karnataka" — red, underlined
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE)
    const regdTxt = 'Regd. By Govt of Karnataka'
    doc.text(regdTxt, 0, 38, { width: W, align: 'center', lineBreak: false })
    const rW = doc.widthOfString(regdTxt)
    hRule(doc, W / 2 - rW / 2, 47, W / 2 + rW / 2, 0.8, BLUE)

    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
    doc.text('Reg. No.: SOR/810/DRCS-688/08-09', W - 234, 16, {
      width: 216,
      align: 'right',
      lineBreak: false,
    })
    doc.text(`I.S.No.: ${certNum}`, W - 234, 27, {
      width: 216,
      align: 'right',
      lineBreak: false,
    })

    // hRule(doc, 16, 42, W - 16, 0.8, GOLD)

    // ── 4. LOGO SECTION ───────────────────────────────────────────────────────
    //
    //  Layout (drawn in this order so logos appear on top of arc):
    //  a) arc_text.png  — full page width arc header
    //  b) kaushal logo  — left side
    //  c) skill_india   — right side
    //  d) aice_logo_full — centered  (contains: AICE SOCIETY ®, ISO badge,
    //                                 SKILL DEV text, ornamental line — all pre-rendered)
    //
    const logoY = 44

    // b) Kaushal Karnataka — left, inside arc
    safeImage(doc, ip('kaushal_karnataka_logo.png'), 14, logoY + 8, {
      width: 60,
      height: 90,
    })

    // c) Skill India — right, inside arc
    safeImage(doc, ip('skill_india_logo.png'), W - 88, logoY + 10, {
      width: 74,
      height: 80,
    })

    // d) AICE Logo Full (708x352 actual) — centered, larger to match reference
    const aiceW = 260,
      aiceH = aiceW * (352 / 708) // 260 x 129.4
    safeImage(
      doc,
      ip('aice_logo_full-removebg-preview.png'),
      W / 2 - aiceW / 2,
      logoY + 60, // ← Change this number to move it down (increase) or up (decrease)
      { width: aiceW, height: aiceH },
    )

    // a) Arc text drawn LAST so it renders on top of the aice logo
    // 994x251 actual pixels
    const arcW = W - 140
    const arcH = arcW * (251 / 994)
    safeImage(doc, ip('arc_text-removebg.png'), (W - arcW) / 2, logoY + 25, {
      width: arcW,
      height: arcH,
    })

    // Logo section ends at bottom of arc
    const logoEnd = logoY + 130 // ~174

    // ── 5. SEPARATOR AFTER LOGOS ─────────────────────────────────────────────
    // hRule(doc, 16, logoEnd + 5, W - 16, 0.9, GOLD)

    // ── 6. KSDC / "Certificate" / NSDC ───────────────────────────────────────
    const midY = logoEnd + 6 // ~180

    // KSDC — left, larger to match reference
    safeImage(doc, ip('ksdc_logo.png'), 14, midY + 20, {
      width: 108,
      height: 68,
      fit: [108, 68],
    })

    // NSDC — right, larger to match reference
    safeImage(doc, ip('nsdc_logo.png'), W - 124, midY + 20, {
      width: 110,
      height: 62,
      fit: [110, 62],
    })

    // Ornamental scrollwork (center)
    // const ornY = midY + 14
    // hRule(doc, W / 2 - 128, ornY, W / 2 - 52, 0.8, GOLD)
    // hRule(doc, W / 2 + 52, ornY, W / 2 + 128, 0.8, GOLD)
    // doc.lineWidth(1.3).strokeColor(GOLD)
    // doc
    //   .moveTo(W / 2 - 52, ornY)
    //   .bezierCurveTo(
    //     W / 2 - 36,
    //     ornY - 10,
    //     W / 2 - 18,
    //     ornY - 6,
    //     W / 2 - 8,
    //     ornY,
    //   )
    //   .bezierCurveTo(W / 2 - 2, ornY + 4, W / 2, ornY + 6, W / 2, ornY)
    //   .bezierCurveTo(W / 2, ornY - 6, W / 2 + 2, ornY - 3, W / 2 + 8, ornY)
    //   .bezierCurveTo(
    //     W / 2 + 18,
    //     ornY - 6,
    //     W / 2 + 36,
    //     ornY - 10,
    //     W / 2 + 52,
    //     ornY,
    //   )
    //   .stroke()

    // "Certificate" — large Times-BoldItalic, centred
    doc.font('Times-BoldItalic').fontSize(54).fillColor(DARK)
    doc.text('Certificate', 0, midY + 60, {
      width: W,
      align: 'center',
      lineBreak: false,
    })

    // Double gold rule
    const certLineY = midY + 80
    // hRule(doc, W / 2 - 172, certLineY, W / 2 + 172, 3.0, GOLD)
    // hRule(doc, W / 2 - 172, certLineY + 4, W / 2 + 172, 0.7, GOLD)

    // ── 7. CONTENT BOX ───────────────────────────────────────────────────────
    const BX = 16,
      BY = certLineY + 40,
      BW = W - 32,
      BH = 236

    doc.lineWidth(2.5).strokeColor(GOLD).rect(BX, BY, BW, BH).stroke()
    doc
    // .lineWidth(0.7)
    // .strokeColor(GOLD)
    // .rect(BX + 3, BY + 3, BW - 6, BH - 6)
    // .stroke()

    // Top-left: small accreditation text
    doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#888888')
    doc.text('Accridated by Govt. of Karanataka and India', BX + 8, BY + 9, {
      lineBreak: false,
    })

    // Top-right: "This is certify that"
    doc.font('Times-BoldItalic').fontSize(12.5).fillColor('#333333')
    doc.text('This is certify that', BX + 8, BY + 8, {
      width: BW - 16,
      align: 'right',
      lineBreak: false,
    })

    hRule(doc, BX + 6, BY + 28, BX + BW - 6, 0.5, GOLD)

    const IL = BX + 12,
      IR = BX + BW - 12,
      LH = 28

    // Row 1: prefix + STUDENT FULL NAME
    const R1Y = BY + 40
    const shriTxt = 'Shri / Shrimati / Kumar / Kumari'
    doc.font('Times-Italic').fontSize(11).fillColor(DARK)
    doc.text(shriTxt, IL, R1Y, { lineBreak: false })
    const shriW = doc.widthOfString(shriTxt)
    const nameX = IL + shriW + 10
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(BLUE)
    doc.text(fullName, nameX, R1Y - 1, { width: IR - nameX, lineBreak: false })
    hRule(doc, nameX, R1Y + 17, IR, 0.8, GREY)

    // Row 2: S/D/W + FATHER NAME
    const R2Y = R1Y + LH
    const sdTxt = 'S / D / W / Shri / Shrimati'
    doc.font('Times-Italic').fontSize(11).fillColor(DARK)
    doc.text(sdTxt, IL, R2Y, { lineBreak: false })
    const sdW = doc.widthOfString(sdTxt)
    const fatherX = IL + sdW + 10
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(BLUE)
    doc.text((student.fatherName || '').toUpperCase(), fatherX, R2Y - 1, {
      width: IR - fatherX,
      lineBreak: false,
    })
    hRule(doc, fatherX, R2Y + 17, IR, 0.8, GREY)

    // Row 3: "Has successfully Completed / ~~Undergone~~ the course"
    const R3Y = R2Y + LH + 6
    doc.font('Times-BoldItalic').fontSize(12.5).fillColor(DARK)
    const p1 = 'Has successfully Completed / ',
      p2 = 'Undergone',
      p3 = ' the course'
    const rowW = doc.widthOfString(p1 + p2 + p3)
    let cx = IL + (BW - 24 - rowW) / 2
    doc.text(p1, cx, R3Y, { lineBreak: false })
    cx += doc.widthOfString(p1)
    doc.text(p2, cx, R3Y, { lineBreak: false })
    const uW = doc.widthOfString(p2)
    hRule(doc, cx, R3Y + 7, cx + uW, 1.2, DARK) // strikethrough on "Undergone"
    cx += uW
    doc.text(p3, cx, R3Y, { lineBreak: false })

    // Row 4: "in" + COURSE NAME
    const R4Y = R3Y + LH
    doc.font('Times-Italic').fontSize(11).fillColor(DARK)
    doc.text('in', IL, R4Y, { lineBreak: false })
    const inW = doc.widthOfString('in')
    const courseX = IL + inW + 10
    doc.font('Helvetica-Bold').fontSize(13).fillColor(BLUE)
    doc.text(student.course.name, courseX, R4Y - 1, {
      width: IR - courseX,
      lineBreak: false,
    })
    hRule(doc, courseX, R4Y + 16, IR, 0.8, GREY)

    // Row 5: From [date] for a Duration of [N months]
    const R5Y = R4Y + LH + 2
    let rx = IL
    const seg = (txt, font, sz, color, ul) => {
      doc.font(font).fontSize(sz).fillColor(color)
      doc.text(txt, rx, R5Y, { lineBreak: false })
      const tw = doc.widthOfString(txt)
      if (ul) hRule(doc, rx, R5Y + sz + 2, rx + tw, 0.8, GREY)
      rx += tw
    }
    seg('From  ', 'Times-BoldItalic', 12, DARK)
    seg(fmtDate(student.enrollmentDate), 'Helvetica-Bold', 12, BLUE, true)
    seg('  for a Duration of  ', 'Times-BoldItalic', 12, DARK)
    seg(
      `${student.courseDuration || ''} months`,
      'Helvetica-Bold',
      12,
      BLUE,
      true,
    )

    // Row 6: With [GRADE] Grade
    const R6Y = R5Y + LH + 8
    const grade = student.grade || 'A'
    doc.font('Times-BoldItalic').fontSize(13).fillColor('#444444')
    doc.text('With', 0, R6Y + 2, {
      width: W / 2 - 8,
      align: 'right',
      lineBreak: false,
    })
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BLUE)
    const grX = W / 2 + 2
    doc.text(grade, grX, R6Y - 4, { lineBreak: false })
    const grW = doc.widthOfString(grade)
    hRule(doc, grX - 2, R6Y + 25, grX + grW + 6, 1.5, GOLD)
    doc.font('Times-BoldItalic').fontSize(13).fillColor('#444444')
    doc.text('Grade', grX + grW + 10, R6Y + 2, { lineBreak: false })

    // ── 8. GRADE LEGEND ───────────────────────────────────────────────────────
    const legendY = BY + BH + 6
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(DARK)
    doc.text(
      'Grades: 50 to 60-C,  60 to 70-B,  70 to 75-B+,  75 to 85-A,  85 and Above-A+',
      BX + 6,
      legendY,
      { width: BW - 12, align: 'center', lineBreak: false },
    )

    // ── 9. BOTTOM ZONE ────────────────────────────────────────────────────────
    const BOT = legendY + 40

    // Photo — centred
    const pW = 110,
      pH = 138
    const pX = (W - pW) / 2,
      pY = BOT + 52

    doc.save()
    doc
      .rect(pX, pY, pW, pH)
      .lineWidth(2)
      .strokeColor(GOLD)
      .fillColor('#f5f0e8')
      .fillAndStroke()
    const photoPath = resolvePhotoPath(student)
    if (photoPath) {
      try {
        doc.rect(pX + 1, pY + 1, pW - 2, pH - 2).clip()
        doc.image(photoPath, pX + 1, pY + 1, {
          width: pW - 2,
          height: pH - 2,
          cover: [pW - 2, pH - 2],
          align: 'center',
          valign: 'center',
        })
      } catch (e) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#aaaaaa')
          .text('Photo', pX, pY + pH / 2 - 6, { width: pW, align: 'center' })
      }
    } else {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#aaaaaa')
        .text('Student Photo', pX, pY + pH / 2 - 6, {
          width: pW,
          align: 'center',
        })
    }
    doc.restore()

    // AICE circular stamp (overlaps bottom of photo)
    const sX = pX + pW / 2,
      sY = pY + pH - 20,
      sR = 36
    doc.save()
    doc.circle(sX, sY, sR).fillOpacity(0.22).fillColor('#ffffff').fill()
    doc.fillOpacity(1)
    doc.circle(sX, sY, sR).lineWidth(1.8).strokeColor(NAVY).stroke()
    doc
      .circle(sX, sY, sR - 5)
      .lineWidth(0.7)
      .strokeColor(NAVY)
      .stroke()
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY)
    doc.text('AICES', sX - 16, sY - 16, {
      width: 32,
      align: 'center',
      lineBreak: false,
    })
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(NAVY)
    doc.text('Vijayapur', sX - 16, sY - 4, {
      width: 32,
      align: 'center',
      lineBreak: false,
    })
    doc.text('Ph: 41225', sX - 16, sY + 4, {
      width: 32,
      align: 'center',
      lineBreak: false,
    })
    // Arc text around stamp — smaller arcR = smaller circumference = tighter character spacing
    const arcTxt = 'Academic Institute of Computer Education Society '
    const arcR = sR - 12 // radius 24 — tight enough for chars to touch
    const arcSpan = Math.PI * 1.82
    const arcStart = -Math.PI / 2 - arcSpan / 2
    doc.font('Helvetica').fontSize(5).fillColor(NAVY)
    for (let i = 0; i < arcTxt.length; i++) {
      const angle = arcStart + (i / arcTxt.length) * arcSpan
      doc.save()
      doc.translate(sX + arcR * Math.cos(angle), sY + arcR * Math.sin(angle))
      doc.rotate((angle + Math.PI / 2) * (180 / Math.PI))
      doc.text(arcTxt[i], -2, -3, { lineBreak: false })
      doc.restore()
    }
    doc.restore()

    // Subjects — left of photo
    const subjects =
      student.course.subjects && student.course.subjects.length > 0
        ? student.course.subjects
        : []
    const subjX = 20,
      subjMaxW = pX - subjX - 8
    let subjY = BOT + 4
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK)
    doc.text(student.course.name, subjX, subjY, {
      width: subjMaxW,
      lineBreak: false,
    })
    subjY += 15
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor(DARK)
    subjects.forEach((s) => {
      doc.text(s, subjX, subjY, { width: subjMaxW, lineBreak: false })
      subjY += 13
    })

    // Date of issue — right of photo
    const dateLX = pX + pW + 8,
      dateRE = W - 18
    doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK)
    doc.text(
      fmtDMY(student.certificateIssuedDate || new Date()),
      dateLX,
      BOT + 8,
      { width: dateRE - dateLX, align: 'right', lineBreak: false },
    )
    doc.font('Helvetica').fontSize(9).fillColor('#444444')
    doc.text('Date of issue', dateLX, BOT + 26, {
      width: dateRE - dateLX,
      align: 'right',
      lineBreak: false,
    })

    // ── 10. SIGNATURES ────────────────────────────────────────────────────────
    //
    //  Director: signature image (401×134) + "Director" label below the line
    //  President: president_signature.png (625×444) which ALREADY contains
    //             the signature AND "PRESIDENT" text — no separate label needed
    //
    const sigLineY = pY + pH + 0
    const sigLabelY = sigLineY + 0

    // Director (left)
    safeImage(doc, ip('director_signature.png'), 20, sigLineY - 34, {
      width: 92,
      height: 30,
      fit: [92, 30],
    })
    hRule(doc, 18, sigLineY, 174, 0.9, DARK)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
    doc.text('Director', 18, sigLabelY, {
      width: 156,
      align: 'center',
      lineBreak: false,
    })

    // President (right)
    const presW = 78,
      presH = presW * (444 / 625)
    safeImage(doc, ip('president_signature.png'), W - 172, sigLineY - 40, {
      width: presW,
      height: presH,
    })
    hRule(doc, W - 174, sigLineY, W - 18, 0.9, DARK)
    // NOTE: president_signature.png already contains "PRESIDENT" text — no label needed

    // ── 11. FOOTER ────────────────────────────────────────────────────────────
    const FY = H - 44
    hRule(doc, 16, FY - 5, W - 16, 0.9, GOLD)
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(DARK)
    doc.text(
      'HO : 2nd Floor Vishnu Complex, S.S. Road, Vijayapura-586101.',
      0,
      FY,
      { width: W, align: 'center', lineBreak: false },
    )
    doc.text(
      'Center : 2nd Floor Vishnu Complex, S.S. Road, Vijayapura-586101.',
      0,
      FY + 11,
      { width: W, align: 'center', lineBreak: false },
    )
    doc.font('Helvetica-Bold').fontSize(6.2).fillColor(DARK)
    doc.text(
      'AICES & AICES logo are registered trade marks of ACADEMIC INSTITUTE OF COMPUTER EDUCATION SOCIETY',
      0,
      FY + 23,
      { width: W, align: 'center', lineBreak: false },
    )

    // ─────────────────────────────────────────────────────────────────────────
    doc.end()

    ws.on('finish', async () => {
      try {
        student.certificateIssued = true
        student.certificateIssuedDate =
          student.certificateIssuedDate || new Date()
        student.certificateNumber = certNum
        await student.save()
      } catch (e) {
        console.error('save', e.message)
      }

      const safe = fullName.replace(/\s+/g, '_')
      res.download(filePath, `Certificate_${safe}_${certNum}.pdf`, (err) => {
        if (err && !res.headersSent)
          res.status(500).json({ message: 'Error sending file' })
      })
    })
    ws.on('error', (err) => {
      if (!res.headersSent)
        res.status(500).json({ message: 'File write error' })
    })
  } catch (err) {
    console.error('Certificate error:', err)
    res
      .status(500)
      .json({ message: err.message || 'Failed to generate certificate' })
  }
}

// ─── Other routes (unchanged) ─────────────────────────────────────────────────
exports.getEligibleStudents = async (req, res) => {
  try {
    const students = await Student.find({
      status: 'active',
      pendingFees: 0,
      certificateIssued: false,
      certificateEligible: true,
    })
      .populate('course', 'name')
      .populate('addedBy', 'name')
      .sort('firstName')
    res.json(students)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

exports.getIssuedCertificates = async (req, res) => {
  try {
    const students = await Student.find({ certificateIssued: true })
      .populate('course', 'name')
      .populate('addedBy', 'name')
      .sort('-certificateIssuedDate')
    res.json(students)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

exports.markCourseCompleted = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).populate(
      'course',
      'name duration',
    )
    if (!student) return res.status(404).json({ message: 'Student not found' })
    student.courseCompleted = true
    await student.save()
    res.json({
      message: 'Course marked as completed',
      certificateEligible: student.certificateEligible,
    })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

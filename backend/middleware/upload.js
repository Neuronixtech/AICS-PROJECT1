const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExt = /jpeg|jpg|png|pdf|doc|docx/;
  const ext = allowedExt.test(path.extname(file.originalname).toLowerCase());
  const isImage = file.mimetype.startsWith('image/');
  const isDoc = ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype);
  if (ext && (isImage || isDoc)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, JPG, PNG, PDF, DOC, DOCX files allowed'));
  }
};

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// Named fields for student document uploads (3 specific sections)
const uploadStudentDocs = upload.fields([
  { name: 'studentPhoto', maxCount: 1 },
  { name: 'qualificationDoc', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 }
]);

module.exports = upload;
module.exports.uploadStudentDocs = uploadStudentDocs;

const express = require('express');
const router = express.Router();
const {
  generateCertificate,
  getEligibleStudents,
  getIssuedCertificates,
  markCourseCompleted
} = require('../controllers/certificateController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

// FIX: Use GET for certificate generation (frontend expects GET with blob response)
router.get('/generate/:studentId', generateCertificate);
router.get('/eligible', getEligibleStudents);
router.get('/issued', getIssuedCertificates);
router.put('/mark-completed/:studentId', markCourseCompleted);

module.exports = router;

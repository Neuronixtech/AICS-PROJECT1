const express = require('express');
const router = express.Router();
const {
  addDiscount, getAllDiscounts, updateDiscount,
  deleteDiscount, validateCoupon, getActiveDiscounts
} = require('../controllers/discountController');
const { protect, adminOrStaff, adminOnly } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(adminOrStaff, getAllDiscounts)
  .post(adminOnly, addDiscount);

router.get('/active', adminOrStaff, getActiveDiscounts);
router.post('/validate', adminOrStaff, validateCoupon);

router.route('/:id')
  .put(adminOnly, updateDiscount)
  .delete(adminOnly, deleteDiscount);

module.exports = router;

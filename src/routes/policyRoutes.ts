import express from 'express';
import { getPolicies, getPolicyByKey, updatePolicy } from '../controllers/policyController';

const router = express.Router();

router.get('/', getPolicies);
router.get('/:key', getPolicyByKey);
router.put('/:key', updatePolicy);

export default router;

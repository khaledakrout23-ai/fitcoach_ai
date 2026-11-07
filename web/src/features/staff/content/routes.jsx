// Routes « staff/content » (relatives à /salle), permission « content » (gérant, coach)
import { Permission } from '../../../app/guards';
import Exercises from './Exercises';
import Programs from './Programs';
import Nutrition from './Nutrition';
import Coach from './Coach';

export default [
  { path: 'exercices', element: <Permission name="content"><Exercises /></Permission> },
  { path: 'programmes', element: <Permission name="content"><Programs /></Permission> },
  { path: 'nutrition', element: <Permission name="content"><Nutrition /></Permission> },
  { path: 'coach', element: <Permission name="content"><Coach /></Permission> },
];

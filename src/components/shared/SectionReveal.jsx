import { motion } from 'framer-motion';
import { fadeUp } from '../../animations/fade';

export default function SectionReveal({ children }) {
  return (
    <motion.div
      variants={fadeUp}
      initial='hidden'
      whileInView='show'
      viewport={{ once: true }}
    >
      {children}
    </motion.div>
  );
}
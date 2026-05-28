import { motion } from 'framer-motion';

export default function MagneticButton({ children }) {
  return (
    <motion.button
      whileHover={{
        scale: 1.08,
        y: -4,
      }}
      whileTap={{
        scale: 0.95,
      }}
      className='px-6 py-3 rounded-full bg-green-500 shadow-[0_0_30px_rgba(0,255,136,0.5)]'
    >
      {children}
    </motion.button>
  );
}
import styles from './Card.module.css';

export default function Card({ label = '??', faceDown = false }) {
  const className = faceDown ? `${styles.card} ${styles.faceDown}` : styles.card;

  return (
    <div className={className}>
      <span className={styles.label}>{faceDown ? 'CARD' : label}</span>
    </div>
  );
}

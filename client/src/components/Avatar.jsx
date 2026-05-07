import styles from './Avatar.module.css';

export default function Avatar({ name = 'Player 1', status = 'Ready' }) {
  return (
    <div className={styles.avatar}>
      <div className={styles.circle} aria-hidden="true" />
      <div>
        <div className={styles.name}>{name}</div>
        <div className={styles.status}>{status}</div>
      </div>
    </div>
  );
}

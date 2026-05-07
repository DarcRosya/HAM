import Card from './Card.jsx';
import styles from './Hand.module.css';

const starterCards = ['AS', '10H', '3D', 'KC', '7S'];

export default function Hand() {
  return (
    <div className={styles.hand}>
      {starterCards.map((label, index) => (
        <Card key={`${label}-${index}`} label={label} />
      ))}
    </div>
  );
}

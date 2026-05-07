import { useState } from "react";

export default function Battle() {
  const [gameState, setGameState] = useState({
    player: {
      health: 20,
      hand: [],
      field: []
    },
    opponent: {
      health: 20,
      field: []
    },
    gameInfo: {
      turn: "player",
      timer: 30,
      round: 1
    }
  });

  return (
    <div>
      <h2>Battlefield</h2>

      <div>
        <h4>Opponent HP: {gameState.opponent.health}</h4>
        <p>Opponent field cards: {gameState.opponent.field.length}</p>
      </div>

      <hr/>

      <div>
        <h4>Your HP: {gameState.player.health}</h4>

        <div>
          <p>Your cards on field: {gameState.player.field.length}</p>
        </div>

        <div>
          <p>Your cards in hand: {gameState.player.hand.length}</p>
        </div>

        <hr/>

        <div>
          <p>Turn: {gameState.gameInfo.turn}</p>
          <p>Time: {gameState.gameInfo.timer}s</p>
          <p>Round: {gameState.gameInfo.round}</p>
        </div>
      </div>
    </div>
  );
}

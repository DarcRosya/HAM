import { useState, useEffect } from "react";
import { socket } from "../services/socket";

export default function Battle() {
    const [gameState, setGameState] = useState({
        player: {
          health: 20,
          hand: [
            { id: 1, name: "card1" },
            { id: 2, name: "card2" },
            { id: 3, name: "card3" }
          ],
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

  useEffect(() => {
    socket.connect();
    socket.on("game_state", (newState) => {
      setGameState(newState);
    });
  
    return () => {
      socket.off("game_state");
      socket.disconnect();
    };
  }, []);

  const playCard = (cardId) => {
    socket.emit("play_card", { cardId });
  };

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

        <hr/>

        <h4>Your cards in hand</h4>
        <div>
          {gameState.player.hand.map((card) => (
            <button
              key={card.id}
              onClick={() => playCard(card.id)}
            >
              {card.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { postAction, seatPlayer } from "@/lib/client/api";
import { getPlayerToken } from "@/lib/client/tokens";
import { useRoomSnapshot } from "@/lib/client/use-room-snapshot";
import { PlayingCard } from "@/components/game/playing-card";
import type { GameActionType } from "@/lib/protocol/types";
import { RoomTable } from "./room-table";
import styles from "./player-room-client.module.css";

interface PlayerRoomClientProps {
  roomCode: string;
}

function makeActionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function PlayerRoomClient({ roomCode }: PlayerRoomClientProps) {
  const [token, setToken] = useState<string | null>(null);
  const [buyIn, setBuyIn] = useState(1000);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(getPlayerToken(roomCode));
  }, [roomCode]);

  const { snapshot, loading, refresh, error: fetchError } = useRoomSnapshot(roomCode, token ?? undefined);

  const mySeat = useMemo(() => {
    if (!snapshot?.yourPlayerId) {
      return null;
    }

    return snapshot.players.find((player) => player.playerId === snapshot.yourPlayerId) ?? null;
  }, [snapshot]);

  const availableSeats = useMemo(() => {
    if (!snapshot) {
      return [] as number[];
    }

    const occupied = new Set(snapshot.players.map((player) => player.seatNo));
    return Array.from({ length: 9 }, (_, seatNo) => seatNo).filter((seatNo) => !occupied.has(seatNo));
  }, [snapshot]);

  const allowed = snapshot?.yourPrivateState?.allowedActions ?? null;

  useEffect(() => {
    if (!allowed) {
      return;
    }

    const minRaisePut = allowed.toCall + Math.max(0, snapshot?.minRaise ?? 0);
    if (allowed.raise) {
      setAmount(Math.max(minRaisePut, 1));
    } else if (allowed.bet) {
      setAmount(Math.max(allowed.minBet, 1));
    }
  }, [allowed, snapshot?.minRaise]);

  const runAction = async (type: GameActionType) => {
    if (!token || !snapshot) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await postAction({
        roomCode,
        token,
        command: {
          actionId: makeActionId(),
          type,
          amount: type === "BET" || type === "RAISE" ? amount : undefined,
        },
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onTakeSeat = async (seatNo: number) => {
    if (!token) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await seatPlayer({ roomCode, token, seatNo, buyIn });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to take seat");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className={styles.main}>
        <h1>Player View · {roomCode}</h1>
        <p>Player token missing. Join this room from the lobby first.</p>
      </main>
    );
  }

  if (loading || !snapshot) {
    return (
      <main className={styles.main}>
        <h1>Player View · {roomCode}</h1>
        <p>Loading room state...</p>
      </main>
    );
  }

  const myCards = snapshot.yourPrivateState?.holeCards ?? [];
  const isYourTurn = Boolean(allowed);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Room {snapshot.roomCode}</h1>
        <p>
          Hand #{snapshot.handNo} · Street: {snapshot.street ?? "-"} · Pot: {snapshot.pot}
        </p>
      </header>

      <RoomTable
        communityCards={snapshot.communityCards}
        players={snapshot.players}
        highlightPlayerId={snapshot.players.find((player) => player.isTurn)?.playerId ?? null}
        yourPlayerId={snapshot.yourPlayerId}
      />

      {!mySeat ? (
        <section className={styles.panel}>
          <h2>Take a seat</h2>
          <label>
            Buy-in
            <input
              type="number"
              min={100}
              max={20000}
              step={50}
              value={buyIn}
              onChange={(event) => setBuyIn(Number(event.target.value))}
            />
          </label>
          <div className={styles.seatButtons}>
            {availableSeats.map((seatNo) => (
              <button key={seatNo} type="button" disabled={busy} onClick={() => onTakeSeat(seatNo)}>
                Seat {seatNo + 1}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.panel}>
            <h2>Your hand</h2>
            <p className={styles.meta}>
              Stack: {mySeat.stack} · {isYourTurn ? "Your turn" : "Waiting"}
            </p>
            <div className={styles.handCards}>
              {myCards.length > 0 ? (
                myCards.map((card, index) => (
                  <PlayingCard
                    key={`${card.rank}_${card.suit}_${index}`}
                    rank={card.rank}
                    suit={card.suit}
                    faceUp
                    size={96}
                  />
                ))
              ) : (
                <>
                  <PlayingCard rank="A" suit="spades" faceUp={false} size={96} />
                  <PlayingCard rank="K" suit="hearts" faceUp={false} size={96} />
                </>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <h2>Actions</h2>
            <div className={styles.actionRow}>
              <button type="button" disabled={!allowed?.fold || busy} onClick={() => runAction("FOLD")}>
                Fold
              </button>
              <button type="button" disabled={!allowed?.check || busy} onClick={() => runAction("CHECK")}>
                Check
              </button>
              <button type="button" disabled={!allowed?.call || busy} onClick={() => runAction("CALL")}>
                Call {allowed?.toCall ?? 0}
              </button>
            </div>
            <div className={styles.actionRow}>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                disabled={busy || !(allowed?.bet || allowed?.raise)}
              />
              <button type="button" disabled={!allowed?.bet || busy} onClick={() => runAction("BET")}>
                Bet
              </button>
              <button type="button" disabled={!allowed?.raise || busy} onClick={() => runAction("RAISE")}>
                Raise
              </button>
              <button type="button" disabled={!allowed?.allIn || busy} onClick={() => runAction("ALL_IN")}>
                All-in
              </button>
            </div>
          </section>
        </>
      )}

      {error || fetchError ? <p className={styles.error}>{error ?? fetchError}</p> : null}
    </main>
  );
}

"use client";

function hostKey(roomCode: string): string {
  return `holdem:host:${roomCode.toUpperCase()}`;
}

function playerKey(roomCode: string): string {
  return `holdem:player:${roomCode.toUpperCase()}`;
}

export function setHostToken(roomCode: string, token: string): void {
  localStorage.setItem(hostKey(roomCode), token);
}

export function getHostToken(roomCode: string): string | null {
  return localStorage.getItem(hostKey(roomCode));
}

export function setPlayerToken(roomCode: string, token: string): void {
  localStorage.setItem(playerKey(roomCode), token);
}

export function getPlayerToken(roomCode: string): string | null {
  return localStorage.getItem(playerKey(roomCode));
}

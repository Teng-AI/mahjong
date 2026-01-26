'use client';

import { useRouter } from 'next/navigation';
import { SessionScoresTable } from './SessionScoresTable';
import { GameLogTabs } from './GameLogTabs';
import { RoundEndActions } from './RoundEndActions';
import { ScoreEditModal } from '@/components/ScoreEditModal';
import { Tile } from '@/components/tiles';
import { sortTilesForDisplay, isGoldTile } from '@/lib/tiles';
import { calculateSettlement } from '@/lib/settle';
import { Room, SeatIndex, SessionScores, GameState, TileId, WinnerInfo } from '@/types';

export interface WinnerResultsScreenProps {
  room: Room;
  roomCode: string;
  gameState: GameState;
  sessionScores: SessionScores | null;
  gameLogs: Record<number, string[]>;
  currentLog: string[];
  isHost: boolean;
  mySeat: SeatIndex;
  myHand: TileId[];
  readyCount: number;
  totalPlayers: number;
  allReady: boolean;
  myReadyState: boolean;
  showSettleModal: boolean;
  setShowSettleModal: (show: boolean) => void;
  showScoreEdit: boolean;
  setShowScoreEdit: (show: boolean) => void;
  transformLogEntry: (entry: string) => string;
  handleToggleReady: () => void;
  startGame: (dealerSeat: SeatIndex) => Promise<void>;
  adjustCumulativeScores: (roomCode: string, adjustments: Record<SeatIndex, number>) => Promise<void>;
}

export function WinnerResultsScreen({
  room,
  roomCode,
  gameState,
  sessionScores,
  gameLogs,
  currentLog,
  isHost,
  mySeat,
  myHand,
  readyCount,
  totalPlayers,
  allReady,
  myReadyState,
  showSettleModal,
  setShowSettleModal,
  showScoreEdit,
  setShowScoreEdit,
  transformLogEntry,
  handleToggleReady,
  startGame,
  adjustCumulativeScores,
}: WinnerResultsScreenProps) {
  const router = useRouter();
  const winner = gameState.winner!;
  const winnerName = room.players[`seat${winner.seat}` as keyof typeof room.players]?.name || 'Unknown';
  const discarderName = winner.discarderSeat !== undefined
    ? room.players[`seat${winner.discarderSeat}` as keyof typeof room.players]?.name || 'Unknown'
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white p-4 relative overflow-hidden">
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-yellow-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute top-1/3 right-1/3 w-[400px] h-[400px] bg-orange-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Fireworks for winner / Sad faces for losers */}
      <WinnerBackgroundEffects isWinner={winner.seat === mySeat} />

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes rocket-launch {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          30% {
            transform: translateY(calc(-100vh + var(--explode-height)));
            opacity: 1;
          }
          35% {
            opacity: 0;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes explosion-appear {
          0%, 25% {
            transform: scale(0);
            opacity: 0;
          }
          30% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        @keyframes firework-explode {
          0%, 25% {
            transform: translate(0, 0) scale(0);
            opacity: 0;
          }
          35% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0.3);
            opacity: 0;
          }
        }
        @keyframes firework-flash {
          0%, 25% {
            transform: scale(0);
            opacity: 0;
          }
          30% {
            transform: scale(1.5);
            opacity: 1;
          }
          50% {
            transform: scale(0.3);
            opacity: 0;
          }
          100% {
            transform: scale(0);
            opacity: 0;
          }
        }
        @keyframes sparkle-twinkle {
          0%, 100% {
            transform: scale(0.5);
            opacity: 0.2;
          }
          50% {
            transform: scale(1.3);
            opacity: 1;
          }
        }
        @keyframes sad-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0.5;
          }
          100% {
            transform: translateY(110vh) rotate(30deg);
            opacity: 0.1;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto relative z-10 h-full flex flex-col">
        {/* Header */}
        <WinnerHeader
          winner={winner}
          winnerName={winnerName}
          discarderName={discarderName}
          isWinner={winner.seat === mySeat}
          isDealer={winner.seat === gameState.dealerSeat}
          dealerStreak={sessionScores?.dealerStreak}
        />

        {/* Main content - 2 column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 mb-3 flex-1">
          {/* Left column - Hands */}
          <div className="flex flex-col gap-3">
            {/* Winning Hand */}
            {winner.hand && (
              <WinningHandDisplay
                winner={winner}
                gameState={gameState}
              />
            )}

            {/* Your Hand (if not winner) */}
            {mySeat !== winner.seat && myHand.length > 0 && (
              <YourHandDisplay
                myHand={myHand}
                mySeat={mySeat}
                gameState={gameState}
              />
            )}
          </div>

          {/* Right column - Scores */}
          <div className="flex flex-col gap-3">
            {/* Score Breakdown */}
            <ScoreBreakdownDisplay winner={winner} />

            {/* Cumulative Scores */}
            {sessionScores?.rounds && (
              <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600">
                <SessionScoresTable
                  room={room}
                  sessionScores={sessionScores}
                  highlightSeat={winner.seat}
                  showEditButton={isHost}
                  onEditClick={() => setShowScoreEdit(true)}
                  compact
                />
              </div>
            )}

            {/* Game Log / Session Summary Tabs */}
            <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600">
              <GameLogTabs
                currentLog={currentLog}
                archivedLogs={gameLogs}
                sessionScores={sessionScores}
                room={room}
                transformEntry={transformLogEntry}
                compact
              />
            </div>
          </div>
        </div>

        {/* Action buttons - centered at bottom */}
        <div className="flex flex-col items-center gap-2 lg:gap-3 mt-auto pt-3">
          {/* Ready status */}
          <p className="text-sm lg:text-base text-slate-400">
            {allReady ? (
              <span className="text-emerald-400">All players ready!</span>
            ) : (
              <span>{readyCount}/{totalPlayers} players ready</span>
            )}
          </p>
          <div className="flex gap-2 lg:gap-3 justify-center flex-wrap">
            <RoundEndActions
              showSettle={!!sessionScores}
              onSettle={() => setShowSettleModal(true)}
              isReady={myReadyState}
              onToggleReady={handleToggleReady}
              isHost={isHost}
              allReady={allReady}
              onStartNextRound={async () => {
                // If dealer won, they stay as dealer (dealer streak)
                // Otherwise, rotate to next player counter-clockwise
                const dealerWon = winner && winner.seat === gameState.dealerSeat;
                const nextDealer = dealerWon
                  ? gameState.dealerSeat
                  : ((gameState.dealerSeat + 1) % 4) as SeatIndex;
                await startGame(nextDealer);
              }}
              anotherRoundText={
                winner && winner.seat === gameState.dealerSeat
                  ? 'Another Round (Dealer Stays)'
                  : 'Another Round'
              }
              size="responsive"
            />
          </div>
        </div>

        {/* Settlement Modal */}
        {showSettleModal && sessionScores && (
          <SettlementModal
            room={room}
            sessionScores={sessionScores}
            onClose={() => setShowSettleModal(false)}
            onLeave={() => router.push('/')}
          />
        )}

        {/* Score Edit Modal (Host Only) */}
        <ScoreEditModal
          isOpen={showScoreEdit}
          onClose={() => setShowScoreEdit(false)}
          players={([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
            const player = room.players[`seat${seat}` as keyof typeof room.players];
            // Compute cumulative "Won" from rounds + adjustments
            let won = 0;
            for (const round of sessionScores?.rounds || []) {
              if (round.winnerSeat === seat && round.score > 0) {
                won += round.score;
              }
            }
            const existingAdjustments = sessionScores?.adjustments || { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };
            won += existingAdjustments[`seat${seat}` as keyof typeof existingAdjustments] || 0;
            return {
              seatIndex: seat,
              name: player?.name || `Player ${seat + 1}`,
              currentWon: won,
            };
          })}
          onSave={async (adjustments) => {
            await adjustCumulativeScores(roomCode, adjustments);
          }}
        />
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS (Internal to this file)
// ============================================

interface WinnerBackgroundEffectsProps {
  isWinner: boolean;
}

function WinnerBackgroundEffects({ isWinner }: WinnerBackgroundEffectsProps) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {isWinner ? (
        // Fireworks for winners - shooting up from bottom and exploding
        <>
          {/* Firework rockets that shoot up and explode */}
          {Array.from({ length: 10 }).map((_, rocketIndex) => {
            const launchPositions = [10, 25, 40, 55, 70, 85, 18, 48, 62, 78];
            const explodeHeights = [15, 25, 20, 30, 22, 28, 35, 18, 32, 24];
            const delays = [0, 0.5, 1.0, 0.3, 0.8, 1.3, 0.2, 0.7, 1.1, 0.4];
            const colors = [
              ['#ff0', '#f80', '#f00', '#ff4'],
              ['#0ff', '#08f', '#00f', '#4ff'],
              ['#f0f', '#f08', '#80f', '#f4f'],
              ['#0f0', '#8f0', '#0f8', '#4f4'],
              ['#ff0', '#fff', '#ff8', '#ffa'],
              ['#f08', '#f0f', '#f4f', '#f8f'],
              ['#0ff', '#0f8', '#0f0', '#8ff'],
              ['#ff0', '#f80', '#fa0', '#fc0'],
              ['#f0f', '#80f', '#a0f', '#c0f'],
              ['#0f0', '#0f8', '#0fa', '#0fc'],
            ];

            return (
              <div key={`rocket-${rocketIndex}`}>
                {/* Rocket trail shooting up */}
                <div
                  className="absolute w-1 rounded-full"
                  style={{
                    left: `${launchPositions[rocketIndex]}%`,
                    bottom: '0',
                    height: '80px',
                    background: `linear-gradient(to top, ${colors[rocketIndex][0]}, transparent)`,
                    animation: `rocket-launch 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                    ['--explode-height' as string]: `${explodeHeights[rocketIndex]}%`,
                  }}
                />
                {/* Explosion burst */}
                <div
                  className="absolute"
                  style={{
                    left: `${launchPositions[rocketIndex]}%`,
                    top: `${explodeHeights[rocketIndex]}%`,
                    animation: `explosion-appear 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                  }}
                >
                  {/* Explosion particles - spreading wide */}
                  {Array.from({ length: 20 }).map((_, particleIndex) => {
                    const angle = (particleIndex * 18) * (Math.PI / 180);
                    const distance = 100 + (particleIndex % 4) * 40;
                    const colorSet = colors[rocketIndex];
                    const color = colorSet[particleIndex % 4];
                    const size = 4 + (particleIndex % 3) * 2;
                    return (
                      <div
                        key={`particle-${particleIndex}`}
                        className="absolute rounded-full"
                        style={{
                          width: `${size}px`,
                          height: `${size}px`,
                          marginLeft: `-${size/2}px`,
                          marginTop: `-${size/2}px`,
                          backgroundColor: color,
                          boxShadow: `0 0 ${size*2}px ${color}, 0 0 ${size*4}px ${color}`,
                          animation: `firework-explode 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                          ['--tx' as string]: `${Math.cos(angle) * distance}px`,
                          ['--ty' as string]: `${Math.sin(angle) * distance + 30}px`,
                        }}
                      />
                    );
                  })}
                  {/* Center flash */}
                  <div
                    className="absolute w-16 h-16 -ml-8 -mt-8 rounded-full"
                    style={{
                      backgroundColor: '#fff',
                      boxShadow: `0 0 40px #fff, 0 0 80px ${colors[rocketIndex][0]}, 0 0 120px ${colors[rocketIndex][1]}`,
                      animation: `firework-flash 2.5s ease-out ${delays[rocketIndex]}s infinite`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {/* Sparkle overlay */}
          {Array.from({ length: 40 }).map((_, i) => {
            const sparkles = ['✨', '⭐', '🌟', '💫', '🎇', '🎆'];
            const sparkle = sparkles[i % sparkles.length];
            const left = ((i * 29) % 100);
            const top = ((i * 41) % 70) + 5;
            const delay = (i * 0.15) % 2.5;
            const size = 1.5 + (i % 3) * 0.6;
            return (
              <div
                key={`sparkle-${i}`}
                className="absolute"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  fontSize: `${size}rem`,
                  animation: `sparkle-twinkle 1.2s ease-in-out ${delay}s infinite`,
                }}
              >
                {sparkle}
              </div>
            );
          })}
        </>
      ) : (
        // Sad faces for losers - falling slowly
        <>
          {Array.from({ length: 15 }).map((_, i) => {
            const sadEmojis = ['😢', '😭', '😿', '💔', '😞', '😔'];
            const emoji = sadEmojis[i % sadEmojis.length];
            // Use stable pseudo-random values based on index
            const left = ((i * 47) % 100);
            const delay = (i * 0.4) % 4;
            const duration = 5 + (i % 5);
            const size = 3 + (i % 3) * 1.5;
            return (
              <div
                key={i}
                className="absolute text-2xl opacity-50"
                style={{
                  left: `${left}%`,
                  top: '-50px',
                  fontSize: `${size}rem`,
                  animation: `sad-fall ${duration}s linear ${delay}s infinite`,
                }}
              >
                {emoji}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

interface WinnerHeaderProps {
  winner: WinnerInfo;
  winnerName: string;
  discarderName: string | null;
  isWinner: boolean;
  isDealer: boolean;
  dealerStreak?: number;
}

function WinnerHeader({ winner, winnerName, discarderName, isWinner, isDealer, dealerStreak }: WinnerHeaderProps) {
  return (
    <div className="text-center mb-3 lg:mb-4">
      {/* Animated title row */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className={`text-4xl sm:text-5xl ${isWinner ? 'animate-bounce' : ''}`} style={{ animationDuration: '1s', animationIterationCount: '3' }}>
          {isWinner
            ? (winner.isThreeGolds ? '🀄🀄🀄' : winner.isRobbingGold ? '💰💰💰' : '🏆')
            : '😔'}
        </div>
        <div className={`text-2xl sm:text-4xl font-bold ${
          !isWinner
            ? 'text-slate-400'
            : winner.isThreeGolds
              ? 'text-yellow-300 animate-pulse'
              : winner.isRobbingGold
                ? 'text-amber-300 animate-pulse'
                : 'text-amber-400'
        }`}>
          {!isWinner
            ? 'So Close...'
            : winner.isThreeGolds ? 'THREE GOLDS!' : winner.isRobbingGold ? 'ROBBING THE GOLD!' : 'WINNER!'}
        </div>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">{winnerName}</div>
      <div className="text-base text-slate-300">
        {winner.isThreeGolds
          ? 'Instant win with 3 Gold tiles!'
          : winner.isRobbingGold
            ? 'Claimed the revealed Gold tile!'
            : winner.isSelfDraw
              ? 'Won by self-draw'
              : `Won on ${discarderName}'s discard`}
        {isDealer && (
          <span className="text-orange-400 ml-2">
            {dealerStreak && dealerStreak > 1
              ? `🔥 ${dealerStreak}-round streak!`
              : ' 🔥 Dealer wins!'}
          </span>
        )}
      </div>
      {/* Score badge */}
      <div className="mt-2 inline-block bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-xl sm:text-2xl font-bold px-5 py-1.5 rounded-full shadow-lg">
        +{winner.score.total} points
      </div>
    </div>
  );
}

interface WinningHandDisplayProps {
  winner: WinnerInfo;
  gameState: GameState;
}

function WinningHandDisplay({ winner, gameState }: WinningHandDisplayProps) {
  const sortedHand = sortTilesForDisplay(winner.hand!, gameState.goldTileType);
  const exposedMelds = gameState.exposedMelds?.[`seat${winner.seat}` as keyof typeof gameState.exposedMelds] || [];

  return (
    <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600 lg:flex-1 flex flex-col">
      <h3 className="text-base lg:text-lg font-semibold text-amber-400 mb-2">Winning Hand</h3>
      <div className="flex flex-wrap gap-1 lg:gap-1.5 mb-2">
        {sortedHand.map((tileId: string, index: number) => {
          // For Three Golds: highlight all gold tiles
          // For other wins: highlight only the winning tile
          const isGold = gameState.goldTileType && isGoldTile(tileId, gameState.goldTileType);
          const isHighlighted = winner.isThreeGolds
            ? isGold
            : tileId === winner.winningTile;
          return (
            <div key={`hand-${index}`} className={`relative ${isHighlighted ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-700 rounded-md' : ''}`}>
              <Tile
                tileId={tileId}
                goldTileType={gameState.goldTileType}
                size="md"
              />
            </div>
          );
        })}
      </div>
      {exposedMelds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 lg:gap-1.5">
          <span className="text-slate-400 text-xs lg:text-sm">Called:</span>
          {exposedMelds.map((meld, meldIndex) => (
            <div key={`meld-${meldIndex}`} className={`flex gap-0.5 rounded p-0.5 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
              {meld.tiles.map((tileId: string, tileIndex: number) => (
                <Tile
                  key={`meld-${meldIndex}-${tileIndex}`}
                  tileId={tileId}
                  goldTileType={gameState.goldTileType}
                  size="md"
                />
              ))}
              {meld.isConcealed && <span className="text-pink-300 text-xs ml-1 self-center">C</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface YourHandDisplayProps {
  myHand: TileId[];
  mySeat: SeatIndex;
  gameState: GameState;
}

function YourHandDisplay({ myHand, mySeat, gameState }: YourHandDisplayProps) {
  const sortedHand = sortTilesForDisplay(myHand, gameState.goldTileType);
  const myExposedMelds = gameState.exposedMelds?.[`seat${mySeat}` as keyof typeof gameState.exposedMelds] || [];

  return (
    <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600 lg:flex-1 flex flex-col">
      <h3 className="text-base lg:text-lg font-semibold text-blue-400 mb-2">Your Hand</h3>
      <div className="flex flex-wrap gap-1 lg:gap-1.5 mb-2">
        {sortedHand.map((tileId: string, index: number) => (
          <Tile
            key={`my-hand-${index}`}
            tileId={tileId}
            goldTileType={gameState.goldTileType}
            size="md"
          />
        ))}
      </div>
      {myExposedMelds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 lg:gap-1.5">
          <span className="text-slate-400 text-xs lg:text-sm">Called:</span>
          {myExposedMelds.map((meld, meldIndex) => (
            <div key={`my-meld-${meldIndex}`} className={`flex gap-0.5 rounded p-0.5 ${meld.isConcealed ? 'bg-pink-800/50' : 'bg-slate-800/70'}`}>
              {meld.tiles.map((tileId: string, tileIndex: number) => (
                <Tile
                  key={`my-meld-${meldIndex}-${tileIndex}`}
                  tileId={tileId}
                  goldTileType={gameState.goldTileType}
                  size="md"
                />
              ))}
              {meld.isConcealed && <span className="text-pink-300 text-xs ml-1 self-center">C</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ScoreBreakdownDisplayProps {
  winner: WinnerInfo;
}

function ScoreBreakdownDisplay({ winner }: ScoreBreakdownDisplayProps) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-3 lg:p-4 border border-slate-600 lg:flex-1">
      <h3 className="text-base lg:text-lg font-semibold text-amber-400 mb-2">Score Breakdown</h3>
      <div className="text-sm lg:text-base space-y-0.5 lg:space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-300">Base:</span>
          <span>{winner.score.base}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Bonus tiles:</span>
          <span>+{winner.score.bonusTiles}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Gold tiles:</span>
          <span>+{winner.score.golds}</span>
        </div>
        {winner.score.concealedKongBonus > 0 && (
          <div className="flex justify-between text-pink-400">
            <span>Concealed Gang:</span>
            <span>+{winner.score.concealedKongBonus}</span>
          </div>
        )}
        {winner.score.exposedKongBonus > 0 && (
          <div className="flex justify-between text-pink-300">
            <span>Exposed Gang:</span>
            <span>+{winner.score.exposedKongBonus}</span>
          </div>
        )}
        {winner.score.dealerStreakBonus > 0 && (
          <div className="flex justify-between text-orange-400">
            <span>Dealer streak:</span>
            <span>+{winner.score.dealerStreakBonus}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-600 pt-1">
          <span className="text-slate-300">Subtotal:</span>
          <span>{winner.score.subtotal}</span>
        </div>
        {winner.isSelfDraw && (
          <div className="flex justify-between">
            <span className="text-slate-300">Self-draw:</span>
            <span>×{winner.score.multiplier}</span>
          </div>
        )}
        {winner.isThreeGolds && (
          <div className="flex justify-between text-yellow-400">
            <span>Three Golds bonus:</span>
            <span>+{winner.score.threeGoldsBonus}</span>
          </div>
        )}
        {winner.isRobbingGold && winner.score.robbingGoldBonus && (
          <div className="flex justify-between text-amber-400">
            <span>Robbing Gold bonus:</span>
            <span>+{winner.score.robbingGoldBonus}</span>
          </div>
        )}
        {winner.score.goldenPairBonus && winner.score.goldenPairBonus > 0 && (
          <div className="flex justify-between text-yellow-400">
            <span>Golden Pair bonus:</span>
            <span>+{winner.score.goldenPairBonus}</span>
          </div>
        )}
        {winner.score.noBonusBonus && winner.score.noBonusBonus > 0 && (
          <div className="flex justify-between text-cyan-400">
            <span>No Bonus bonus:</span>
            <span>+{winner.score.noBonusBonus}</span>
          </div>
        )}
        {winner.score.allOneSuitBonus && winner.score.allOneSuitBonus > 0 && (
          <div className="flex justify-between text-pink-400">
            <span>All One Suit bonus:</span>
            <span>+{winner.score.allOneSuitBonus}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-600 pt-1 font-bold text-base text-amber-400">
          <span>Total:</span>
          <span>{winner.score.total}</span>
        </div>
      </div>
    </div>
  );
}

interface SettlementModalProps {
  room: Room;
  sessionScores: SessionScores;
  onClose: () => void;
  onLeave: () => void;
}

function SettlementModal({ room, sessionScores, onClose, onLeave }: SettlementModalProps) {
  const playerNames: Record<string, string> = {};
  ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
    const player = room.players[`seat${seat}` as keyof typeof room.players];
    playerNames[`seat${seat}`] = player?.name || `Player ${seat + 1}`;
  });
  const { settlements } = calculateSettlement(
    sessionScores.rounds || [],
    playerNames
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-green-900 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-green-700">
        <h3 className="text-xl font-bold mb-4 text-center">Settlement Summary</h3>
        <p className="text-green-300 text-lg mb-4 text-center">
          To balance all scores:
        </p>
        {settlements.length === 0 ? (
          <p className="text-center text-green-200">
            All players are even - no transfers needed!
          </p>
        ) : (
          <div className="space-y-2">
            {settlements.map((s, idx) => (
              <div
                key={idx}
                className="flex justify-between bg-green-800/50 p-2 rounded"
              >
                <span>
                  {playerNames[`seat${s.from}`]} → {playerNames[`seat${s.to}`]}
                </span>
                <span className="font-semibold">{s.amount} pts</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 space-y-2">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-semibold"
          >
            Continue Playing
          </button>
          <button
            onClick={onLeave}
            className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg font-semibold text-lg"
          >
            End Session & Leave
          </button>
        </div>
      </div>
    </div>
  );
}

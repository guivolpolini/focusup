import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Dumbbell, ChevronRight, CheckCircle2 } from 'lucide-react';
import { db } from '../lib/db';
import { isValidCompletedWorkout } from '../lib/gymEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';
import type { GymWorkout } from '../types';

interface GymCardProps {
  onOpenGymPage: () => void;
}

const QUICK_TAGS = ['Peito', 'Costas', 'Perna', 'Braços', 'Cardio', 'Full Body'];

export function GymCard({ onOpenGymPage }: GymCardProps) {
  const todayStr = useMemo(() => formatDateToLocalYYYYMMDD(new Date()), []);
  const workouts = useLiveQuery(() => db.gymWorkouts.toArray()) || [];
  const [selectedTag, setSelectedTag] = useState('');

  // Encontrar o treino de hoje
  const todayWorkout = useMemo(() => {
    return workouts
      .filter(isValidCompletedWorkout)
      .find((w) => formatDateToLocalYYYYMMDD(new Date(w.startedAt)) === todayStr);
  }, [workouts, todayStr]);

  const totalDays = useMemo(() => {
    return workouts.filter(isValidCompletedWorkout).length;
  }, [workouts]);

  const handleQuickMarkToday = async (workoutName: string) => {
    const finalName = workoutName.trim() || 'Treino';
    const newWorkout: GymWorkout = {
      id: `workout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      routineName: finalName,
      startedAt: Date.now(),
      endedAt: Date.now() + 45 * 60 * 1000,
      durationMinutes: 45,
      exercises: [],
      totalVolumeKg: 0,
      totalSetsCompleted: 1,
      notes: finalName,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.gymWorkouts.add(newWorkout);
    setSelectedTag('');
  };

  const handleUnmarkToday = async () => {
    if (!todayWorkout) return;
    await db.gymWorkouts.delete(todayWorkout.id);
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Academia & Treino</h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {totalDays === 1 ? '1 dia registrado' : `${totalDays} dias registrados`}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenGymPage}
          className="text-xs font-bold text-slate-400 hover:text-rose-600 inline-flex items-center gap-0.5 transition cursor-pointer"
        >
          Histórico <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Conteúdo: Status de Hoje */}
      {todayWorkout ? (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="text-xs font-bold text-emerald-900">Treino de Hoje Confirmado</span>
              <p className="text-[11px] font-semibold text-emerald-700">
                {todayWorkout.routineName || 'Treino Realizado'}
              </p>
            </div>
          </div>
          <button
            onClick={handleUnmarkToday}
            className="text-[11px] font-bold text-slate-400 hover:text-rose-600 underline cursor-pointer"
          >
            Desmarcar
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleQuickMarkToday(tag)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition active:scale-95 cursor-pointer"
              >
                + {tag}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Outro treino (ex: Corrida, Pilates...)"
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && selectedTag.trim()) {
                  handleQuickMarkToday(selectedTag);
                }
              }}
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-400 text-slate-800 focus:outline-hidden focus:border-rose-400"
            />
            <button
              onClick={() => handleQuickMarkToday(selectedTag || 'Treino')}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition active:scale-95 cursor-pointer shrink-0"
            >
              Marcar Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-emerald-500 text-white hover:bg-emerald-600',
  secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300',
};

/** Kid-friendly rounded button shared across DinoVerse web surfaces. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-full px-6 py-3 text-lg font-bold shadow transition active:scale-95 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

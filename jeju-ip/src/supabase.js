import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 환경변수가 없어도 페이지 자체는 뜨도록 (안내 배너만 보여줌)
export const hasSupabase = Boolean(url && key);
export const supabase = hasSupabase ? createClient(url, key) : null;

// Supabase 영문 오류 → 한국어
export function authError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않아요.';
  if (m.includes('email not confirmed')) return '이메일 인증이 아직이에요. 메일함의 인증 링크를 눌러 주세요.';
  if (m.includes('already registered') || m.includes('already been registered')) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (m.includes('password') && (m.includes('6') || m.includes('weak') || m.includes('short'))) return '비밀번호는 6자 이상으로 입력해 주세요.';
  if (m.includes('valid email') || m.includes('invalid email')) return '올바른 이메일 형식이 아니에요.';
  if (m.includes('rate limit') || m.includes('too many')) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (m.includes('fetch') || m.includes('network')) return '네트워크 오류예요. 연결을 확인해 주세요.';
  return err?.message || '알 수 없는 오류가 발생했어요.';
}

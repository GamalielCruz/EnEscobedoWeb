import { redirect } from 'next/navigation';

export default function SignInPage() {
  // Redirigir a la página principal donde Clerk maneja la autenticación
  redirect('/');
}

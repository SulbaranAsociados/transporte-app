"use client";

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type MediaItem = {
  id: string;
  file_url: string;
  file_type: 'image' | 'video';
  target_url: string;
};

export default function MediaDisplay() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    async function fetchMedia() {
      console.log('Intentando conectar a Supabase...');
      const { data, error } = await supabase
        .from('media_content')
        .select('*')
        .eq('is_active', true)
        .order('orden', { ascending: true });

      if (error) {
        console.error('Error al obtener datos:', error);
      } else {
        console.log('Datos recibidos desde Supabase:', data);
        setMedia(data as MediaItem[]);
      }
    }

    fetchMedia();
  }, []);

  useEffect(() => {
    if (media.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % media.length);
    }, 5000); // Cambia cada 5 segundos

    return () => clearInterval(interval);
  }, [media]);

  if (media.length === 0) return <div className="w-[350px] h-[350px] bg-gray-200 animate-pulse" />;

  const currentItem = media[currentIndex];

  return (
    <div className="w-[350px] h-[350px] overflow-hidden rounded-lg shadow-lg relative">
      <a href={currentItem.target_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
        {currentItem.file_type === 'image' ? (
          <img 
            src={currentItem.file_url} 
            alt="Display" 
            className="w-full h-full object-cover" 
          />
        ) : (
          <video 
            src={currentItem.file_url} 
            autoPlay 
            muted 
            loop 
            className="w-full h-full object-cover" 
          />
        )}
      </a>
    </div>
  );
}

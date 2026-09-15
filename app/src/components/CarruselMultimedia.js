import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Video } from 'expo-av';
import { createClient } from '@supabase/supabase-js';

// Reemplaza con tus valores reales en .env si usas react-native-dotenv
// Para este prototipo, asegúrate de que SUPABASE_URL y SUPABASE_KEY estén definidos
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default function CarruselMultimedia() {
    const [content, setContent] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        fetchContent();
    }, []);

    const fetchContent = async () => {
        const { data, error } = await supabase.from('media_content').select('*').eq('is_active', true);
        if (data) setContent(data);
    };

    if (content.length === 0) return <Text>Cargando...</Text>;

    const item = content[currentIndex];

    const handlePress = () => {
        if (item.target_url) Linking.openURL(item.target_url);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={handlePress} style={styles.mediaContainer}>
                {item.file_type === 'video' ? (
                    <Video
                        source={{ uri: item.file_url }}
                        style={styles.media}
                        isLooping
                        shouldPlay={isPlaying}
                        isMuted={isMuted}
                        resizeMode="cover"
                    />
                ) : (
                    <Image source={{ uri: item.file_url }} style={styles.media} />
                )}
            </TouchableOpacity>

            <View style={styles.controls}>
                <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)}>
                    <Text style={styles.button}>{isPlaying ? 'Pausar' : 'Play'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsMuted(!isMuted)}>
                    <Text style={styles.button}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    mediaContainer: { flex: 1 },
    media: { flex: 1, width: '100%' },
    controls: { flexDirection: 'row', justifyContent: 'space-around', padding: 20 },
    button: { color: '#fff', fontSize: 18 }
});

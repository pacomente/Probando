package com.cinetream.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Busca servidores de Cinetream en la misma wifi: prueba /api/planes en el puerto 3500 de cada equipo de la red. */
final class BuscadorServidores {
    private static final int PUERTO = 3500;

    private BuscadorServidores() {}

    static List<String> buscar() {
        Set<String> redes = new LinkedHashSet<>();
        Set<String> propias = new LinkedHashSet<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface ni = interfaces.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) {
                        String ip = a.getHostAddress();
                        propias.add(ip);
                        redes.add(ip.substring(0, ip.lastIndexOf('.') + 1));
                    }
                }
            }
        } catch (Exception ignorado) { /* sin red */ }

        List<String> candidatos = new ArrayList<>();
        candidatos.add("10.0.2.2"); // la PC, vista desde el emulador de Android
        for (String red : redes) {
            for (int i = 1; i < 255; i++) {
                String ip = red + i;
                if (!propias.contains(ip)) candidatos.add(ip);
            }
        }

        List<String> encontrados = Collections.synchronizedList(new ArrayList<>());
        ExecutorService hilos = Executors.newFixedThreadPool(48);
        for (String ip : candidatos) hilos.execute(() -> { if (esCinetream(ip)) encontrados.add("http://" + ip + ":" + PUERTO); });
        hilos.shutdown();
        try { hilos.awaitTermination(20, TimeUnit.SECONDS); } catch (InterruptedException ignorado) { Thread.currentThread().interrupt(); }
        List<String> lista = new ArrayList<>(encontrados);
        Collections.sort(lista);
        return lista;
    }

    private static boolean esCinetream(String ip) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + ip + ":" + PUERTO + "/api/planes").openConnection();
            c.setConnectTimeout(700);
            c.setReadTimeout(1500);
            if (c.getResponseCode() != 200) return false;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[2048];
                int n;
                while ((n = in.read(buf)) > 0 && b.size() < 65536) b.write(buf, 0, n);
                return b.toString("UTF-8").contains("\"planes\"");
            }
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}

package com.cinetream.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Cinetream para Android (celular y tele).
 * Muestra la plataforma web del servidor de Cinetream. Sin servidor configurado, abre la demostración
 * que viene adentro de la app. La web habla con la app a través del objeto JavaScript «CinetreamApp».
 */
public class MainActivity extends Activity {

    static final String HOST_LOCAL = "app.cinetream.local";
    static final String URL_LOCAL = "https://" + HOST_LOCAL + "/";

    private WebView web;
    private SharedPreferences prefs;
    private boolean esTele;
    private boolean limpiarHistorial;
    private View pantallaCompleta;
    private WebChromeClient.CustomViewCallback alSalirDePantallaCompleta;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        prefs = getSharedPreferences("cinetream", MODE_PRIVATE);
        esTele = BuildConfig.TELE || getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0C0D12);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " CinetreamApp/" + BuildConfig.VERSION_NAME + (esTele ? " CinetreamTV" : ""));

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Puente(), "CinetreamApp");
        web.setWebViewClient(new Cliente());
        web.setWebChromeClient(new Cromo());

        if (esTele) ocultarBarras(true);
        if (guardado == null || web.restoreState(guardado) == null) abrirInicio();
    }

    // ---------- Servidor ----------
    String servidor() {
        return prefs.contains("servidor") ? prefs.getString("servidor", "") : BuildConfig.SERVIDOR;
    }

    void abrirInicio() {
        String s = servidor();
        limpiarHistorial = true;
        web.loadUrl(s.isEmpty() ? URL_LOCAL + "index.html" : s + "/");
    }

    /** «192.168.0.10:3500» → «http://192.168.0.10:3500». Sin puerto ni esquema se asume el 3500 de Cinetream. */
    static String normalizar(String direccion) {
        String d = direccion == null ? "" : direccion.trim();
        while (d.endsWith("/")) d = d.substring(0, d.length() - 1);
        if (d.isEmpty()) return "";
        if (!d.matches("(?i)^https?://.*")) {
            boolean conPuerto = d.matches(".*:\\d+$");
            boolean esIpOLocal = d.matches("^[0-9.]+(:\\d+)?$") || d.toLowerCase(Locale.ROOT).startsWith("localhost");
            d = (esIpOLocal ? "http://" : "https://") + d + (esIpOLocal && !conPuerto ? ":3500" : "");
        }
        return d;
    }

    private boolean esDeConfianza(Uri u) {
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        if (host.equals(HOST_LOCAL)) return true;
        String s = servidor();
        if (!s.isEmpty() && host.equals(String.valueOf(Uri.parse(s).getHost()).toLowerCase(Locale.ROOT))) return true;
        // El cobro de la suscripción se hace dentro de la app
        return host.endsWith("mercadopago.com.ar") || host.endsWith("mercadopago.com") || host.endsWith("mercadolibre.com")
                || host.endsWith("mercadolibre.com.ar") || host.endsWith("mercadolivre.com");
    }

    // ---------- Pantalla ----------
    void ocultarBarras(boolean ocultar) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(!ocultar);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c == null) return;
            if (ocultar) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else {
                c.show(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(ocultar
                    ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private void salirDePantallaCompleta() {
        if (pantallaCompleta == null) return;
        ((ViewGroup) getWindow().getDecorView()).removeView(pantallaCompleta);
        pantallaCompleta = null;
        if (!esTele) ocultarBarras(false);
        if (alSalirDePantallaCompleta != null) alSalirDePantallaCompleta.onCustomViewHidden();
        alSalirDePantallaCompleta = null;
    }

    // ---------- Ciclo de vida ----------
    @Override
    public void onBackPressed() {
        if (pantallaCompleta != null) { salirDePantallaCompleta(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        super.onBackPressed();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // El botón «atrás» del control remoto también tiene que volver dentro de la plataforma
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK && e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) {
            onBackPressed();
            return true;
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (esTele || pantallaCompleta != null) ocultarBarras(true);
    }

    @Override
    protected void onSaveInstanceState(Bundle salida) {
        super.onSaveInstanceState(salida);
        web.saveState(salida);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    // ---------- Navegador ----------
    private class Cliente extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest pedido) {
            Uri u = pedido.getUrl();
            if (!HOST_LOCAL.equals(u.getHost())) return null;
            return archivoLocal(u.getPath());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
            Uri u = pedido.getUrl();
            String esquema = String.valueOf(u.getScheme());
            // Los reproductores de otros sitios (YouTube, Vimeo…) van en un marco dentro de la página: se dejan cargar
            if (!pedido.isForMainFrame() && (esquema.equals("http") || esquema.equals("https"))) return false;
            if ((esquema.equals("http") || esquema.equals("https")) && esDeConfianza(u)) return false;
            // Links de anunciantes y otros sitios: se abren afuera
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ignorado) {
                // En muchas teles no hay navegador: no se hace nada
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest pedido, WebResourceError error) {
            if (!pedido.isForMainFrame() || HOST_LOCAL.equals(pedido.getUrl().getHost())) return;
            mostrarSinConexion(String.valueOf(error.getDescription()));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (limpiarHistorial) { view.clearHistory(); limpiarHistorial = false; }
        }
    }

    void mostrarSinConexion(String motivo) {
        try {
            limpiarHistorial = true;
            web.loadUrl(URL_LOCAL + "app/sin-conexion.html?servidor=" + URLEncoder.encode(servidor(), "UTF-8")
                    + "&motivo=" + URLEncoder.encode(motivo, "UTF-8"));
        } catch (IOException ignorado) { /* UTF-8 siempre existe */ }
    }

    private WebResourceResponse archivoLocal(String ruta) {
        if (ruta == null || ruta.equals("/") || ruta.isEmpty()) ruta = "/index.html";
        String asset = ruta.startsWith("/app/") ? ruta.substring(1) : "web" + ruta;
        if (asset.contains("..")) return respuesta(404, "text/plain", new ByteArrayInputStream(new byte[0]));
        try {
            InputStream datos = getAssets().open(asset);
            return respuesta(200, tipo(asset), datos);
        } catch (IOException e) {
            // Sin servidor no hay /api: la web pasa sola a modo demostración
            return respuesta(404, ruta.startsWith("/api/") ? "application/json" : "text/plain",
                    new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8)));
        }
    }

    private static WebResourceResponse respuesta(int codigo, String tipo, InputStream datos) {
        return new WebResourceResponse(tipo, "utf-8", codigo, codigo == 200 ? "OK" : "Not Found",
                Collections.singletonMap("Cache-Control", "no-cache"), datos);
    }

    private static String tipo(String archivo) {
        String a = archivo.toLowerCase(Locale.ROOT);
        if (a.endsWith(".html")) return "text/html";
        if (a.endsWith(".js") || a.endsWith(".mjs")) return "text/javascript";
        if (a.endsWith(".css")) return "text/css";
        if (a.endsWith(".svg")) return "image/svg+xml";
        if (a.endsWith(".png")) return "image/png";
        if (a.endsWith(".jpg") || a.endsWith(".jpeg")) return "image/jpeg";
        if (a.endsWith(".webp")) return "image/webp";
        if (a.endsWith(".json") || a.endsWith(".webmanifest")) return "application/json";
        if (a.endsWith(".webm")) return "video/webm";
        if (a.endsWith(".mp4")) return "video/mp4";
        return "application/octet-stream";
    }

    private class Cromo extends WebChromeClient {
        @Override
        public void onShowCustomView(View vista, CustomViewCallback alSalir) {
            if (pantallaCompleta != null) { alSalir.onCustomViewHidden(); return; }
            pantallaCompleta = vista;
            alSalirDePantallaCompleta = alSalir;
            vista.setBackgroundColor(0xFF000000);
            ((ViewGroup) getWindow().getDecorView()).addView(vista, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            ocultarBarras(true);
        }

        @Override
        public void onHideCustomView() { salirDePantallaCompleta(); }

        @Override
        public Bitmap getDefaultVideoPoster() {
            // Sin el ícono gris de «play» que pone Android antes de que cargue el video
            return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        }
    }

    // ---------- Lo que la web puede pedirle a la app ----------
    private class Puente {
        @JavascriptInterface public String servidor() { return MainActivity.this.servidor(); }
        @JavascriptInterface public boolean esTele() { return esTele; }
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }

        @JavascriptInterface public void conectar(String direccion) {
            String d = normalizar(direccion);
            prefs.edit().putString("servidor", d).apply();
            runOnUiThread(MainActivity.this::abrirInicio);
        }

        @JavascriptInterface public void usarDemo() {
            prefs.edit().putString("servidor", "").apply();
            runOnUiThread(MainActivity.this::abrirInicio);
        }

        @JavascriptInterface public void reintentar() { runOnUiThread(MainActivity.this::abrirInicio); }

        @JavascriptInterface public void buscarServidores() {
            new Thread(() -> {
                List<String> encontrados = BuscadorServidores.buscar();
                StringBuilder json = new StringBuilder("[");
                for (int i = 0; i < encontrados.size(); i++) {
                    if (i > 0) json.append(',');
                    json.append('"').append(encontrados.get(i).replace("\\", "").replace("\"", "")).append('"');
                }
                json.append(']');
                runOnUiThread(() -> web.evaluateJavascript(
                        "window.cinetreamServidores && window.cinetreamServidores(" + json + ")", null));
            }, "buscar-servidores").start();
        }

        @JavascriptInterface public void pantallaEncendida(boolean encendida) {
            runOnUiThread(() -> {
                if (encendida) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}

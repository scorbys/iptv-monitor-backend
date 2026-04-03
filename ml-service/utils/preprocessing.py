import re
import string
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory

class TextPreprocessor:
    def __init__(self):
        # Initialize stemmer
        stemmer_factory = StemmerFactory()
        self.stemmer = stemmer_factory.create_stemmer()

        # Initialize stopwords
        stopword_factory = StopWordRemoverFactory()
        self.stopwords = set(stopword_factory.get_stop_words())

        # Slang dictionary
        self.slang_dict = {
            "gk": "tidak", "ga": "tidak", "gak": "tidak", "tdk": "tidak",
            "yg": "yang", "dgn": "dengan", "utk": "untuk", "bgt": "banget",
            "kmrn": "kemarin", "pls": "tolong", "plz": "tolong"
        }

        # Technical terms normalization
        self.tech_map = {
            "chromcast": "chromecast", "chromecst": "chromecast",
            "cromecast": "chromecast", "chrome_cast": "chromecast",
            "hdmi1": "hdmi", "hdmi-1": "hdmi", "hdmi_1": "hdmi",
            "hdmi 1": "hdmi", "hdmi2": "hdmi", "hdmi-2": "hdmi",
            "no signal": "nosignal", "no-signal": "nosignal",
            "nosignal": "nosignal",
            "reboot": "restart", "resart": "restart",
            "re-strat": "restart", "restart": "restart",
            "unplug": "replug", "replug": "replug",
            "re-plug": "replug", "reunplug": "replug",
            "power adaptor": "adaptor", "power-adaptor": "adaptor",
            "adapter": "adaptor", "adaptor": "adaptor",
            "lan out": "lanout", "lan in": "lanin",
            "kabel lan": "lan"
        }

        # Create phrase patterns
        self.phrase_patterns = [
            (re.compile(re.escape(k)), v)
            for k, v in self.tech_map.items()
            if " " in k or "-" in k
        ]

    def expand_slang(self, text):
        """Convert slang words to formal Indonesian"""
        words = text.split()
        return " ".join([self.slang_dict.get(word, word) for word in words])

    def normalize_tech_words(self, text):
        """Normalize technical terms"""
        if not isinstance(text, str):
            return text

        t = text
        for pattern, replacement in self.phrase_patterns:
            t = pattern.sub(replacement, t)

        tokens = []
        for word in t.split():
            word_clean = re.sub(r"[^a-z0-9]", "", word)
            tokens.append(self.tech_map.get(word_clean, word_clean))

        return " ".join(tokens)

    def preprocess(self, text):
        """Main preprocessing function"""
        if not isinstance(text, str):
            return ""

        # Limit input length to prevent abuse
        if len(text) > 50000:  # Max 50KB text
            text = text[:50000]

        # Lowercase + remove URLs
        text = re.sub(r"http\S+", " ", text.lower())

        # Remove symbols (keep letters, numbers, spaces)
        text = re.sub(r"[^a-z0-9\s]", " ", text)

        # Remove numbers
        text = re.sub(r"\d+", " ", text)

        # Clean up spacing
        text = re.sub(r"\s+", " ", text).strip()

        # Expand slang
        text = self.expand_slang(text)

        # Remove stopwords (but keep negation words)
        negation_words = {"tidak", "bukan", "jangan"}
        tokens = [
            word for word in text.split()
            if word in negation_words or (word not in self.stopwords and len(word) > 1)
        ]

        # Stemming with timeout protection
        try:
            text = self.stemmer.stem(" ".join(tokens))
        except Exception as e:
            # Fallback to unstemmed if stemming fails
            text = " ".join(tokens)

        return text

    def get_text_features(self, text, cleaned_text):
        """Extract numeric features from text"""
        text_len = len(text) if isinstance(text, str) else 0
        word_count = len(cleaned_text.split()) if isinstance(cleaned_text, str) and cleaned_text.strip() else 0
        return text_len, word_count

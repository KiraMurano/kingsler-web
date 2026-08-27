import unittest
from collections import Counter
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from build_kinglier_print import deck_cards, token_counts


class PrintLayoutSpec(unittest.TestCase):
    def test_deck_has_exact_rulebook_distribution(self):
        cards = deck_cards()
        self.assertEqual(len(cards), 47)
        self.assertEqual(
            Counter(cards),
            {
                "blackmailer.webp": 3,
                "heir.webp": 3,
                "joker.webp": 3,
                "knight.webp": 3,
                "thief.webp": 3,
                "treasurer.webp": 3,
                "intrigue-reception.webp": 2,
                "intrigue-blackbook.webp": 2,
                "intrigue-inforator.webp": 2,
                "intrigue-dossier.webp": 2,
                "intrigue-bulla.webp": 2,
                "intrigue-plot.webp": 3,
                "instant-veto.webp": 5,
                "instant-treason.webp": 3,
                "instant-switch.webp": 2,
                "instant-allin.webp": 2,
                "instant-uproar.webp": 2,
                "instant-search.webp": 2,
            },
        )

    def test_five_player_resource_set_has_requested_counts(self):
        self.assertEqual(
            token_counts(),
            {"crowns": 31, "coins": 50, "seals": 15, "actions": 15},
        )


if __name__ == "__main__":
    unittest.main()

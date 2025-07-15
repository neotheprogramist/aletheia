pub mod hash;
mod merge_test;
mod swap_test;
pub mod utils;
mod withdraw_test;

#[cfg(test)]
mod prop_tests {
    use crate::{merge_test::merge, swap_test::swap, withdraw_test::withdraw};
    use proptest::prelude::ProptestConfig;
    use proptest::proptest;

    proptest! {
        #![proptest_config(ProptestConfig {
        cases: 3, .. ProptestConfig::default()
        })]
        #[test]
        fn test_privacy_pool_withdraw(amount in 0u128..=1000000000000000000000u128) {
            tokio::runtime::Runtime::new().unwrap().block_on(async {
                withdraw(amount).await;
            });
        }

        #[test]
        fn test_privacy_pool_swap(amount in 0u128..=1000000000000000000000u128) {
            tokio::runtime::Runtime::new().unwrap().block_on(async {
                swap(amount).await;
            });
        }

        #[test]
        fn test_privacy_pool_merge(amount_1 in 0u128..=1000000000000000000000u128, amount_2 in 0u128..=1000000000000000000000u128 ) {
            tokio::runtime::Runtime::new().unwrap().block_on(async {
                merge(amount_1, amount_2).await;
            });
        }
    }
}

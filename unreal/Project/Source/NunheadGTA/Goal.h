#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Goal.generated.h"

UENUM(BlueprintType)
enum class ETeam : uint8 { Home, Away };

// Posts, crossbar and a trigger box; the ball crossing the line scores for the other team.
UCLASS()
class NUNHEADGTA_API AGoal : public AActor
{
	GENERATED_BODY()
public:
	AGoal();
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Goal") ETeam DefendingTeam = ETeam::Home;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Goal") float Width = 500.f;    // 5 m five-a-side
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Goal") float Height = 200.f;
	UPROPERTY(VisibleAnywhere) class UBoxComponent* Trigger;
	UPROPERTY(VisibleAnywhere) class UStaticMeshComponent* LeftPost;
	UPROPERTY(VisibleAnywhere) class UStaticMeshComponent* RightPost;
	UPROPERTY(VisibleAnywhere) class UStaticMeshComponent* Crossbar;
	UPROPERTY(VisibleAnywhere) class UStaticMeshComponent* Back;
	virtual void OnConstruction(const FTransform& Transform) override;
	UFUNCTION() void OnTriggerBegin(UPrimitiveComponent* Comp, AActor* Other, UPrimitiveComponent* OtherComp, int32 Idx, bool bFromSweep, const FHitResult& Hit);
};
